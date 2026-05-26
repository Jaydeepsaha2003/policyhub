import { v4 as uuid } from 'uuid';
import { and, asc, eq, gte, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb, getRawSqlite } from '../db';
import { policies, premiumPayments } from '../../shared/db/schema';
import { generateInstallments } from '../../shared/installments';
import { rupeesToPaise, type PolicyFormInput } from '../../shared/types';

export const listPolicies = () => {
  const db = getDb();
  return db
    .select()
    .from(policies)
    .where(isNull(policies.deletedAt))
    .orderBy(asc(policies.policyHolder))
    .all();
};

// Recycle bin — soft-deleted policies waiting to be restored or purged.
export const listDeletedPolicies = () => {
  const db = getDb();
  return db
    .select()
    .from(policies)
    .where(isNotNull(policies.deletedAt))
    .orderBy(asc(policies.deletedAt))
    .all();
};

export const getPolicy = (id: string) => {
  const db = getDb();
  const row = db.select().from(policies).where(eq(policies.id, id)).get();
  return row ?? null;
};

const normalize = (input: PolicyFormInput) => ({
  policyNo: input.policyNo.trim(),
  policyHolder: input.policyHolder.trim(),
  holderEmail: input.holderEmail?.trim() || null,
  holderPhone: input.holderPhone?.trim() || null,
  companyName: input.companyName.trim(),
  planName: input.planName.trim(),
  premiumAmount: rupeesToPaise(input.premiumAmount),
  yearlyTotalPremium: rupeesToPaise(input.yearlyTotalPremium),
  paymentMode: input.paymentMode,
  sumAssured: rupeesToPaise(input.sumAssured),
  nomineeName: input.nomineeName.trim(),
  nomineeRelation: input.nomineeRelation?.trim() || null,
  commencementDate: input.commencementDate,
  maturityDate: input.maturityDate,
  policyTermMonths: input.policyTermMonths,
  premiumPaymentTermMonths: input.premiumPaymentTermMonths,
  branchName: input.branchName?.trim() || null,
  agentName: input.agentName?.trim() || null,
  agentContact: input.agentContact?.trim() || null,
  status: input.status ?? 'active',
  maturityType: input.maturityType ?? 'lumpsum',
  maturityFrequency:
    input.maturityType === 'regular_income' ? (input.maturityFrequency ?? null) : null,
  maturityAccountDetails: input.maturityAccountDetails?.trim() || null,
  maturityBankName: input.maturityBankName?.trim() || null,
  maturityAccountNo: input.maturityAccountNo?.trim() || null,
  maturityIfsc: input.maturityIfsc?.trim().toUpperCase() || null,
  maturityBranchName: input.maturityBranchName?.trim() || null,
  maturityAccountHolder: input.maturityAccountHolder?.trim() || null,
  notes: input.notes?.trim() || null,
});

export const createPolicy = (input: PolicyFormInput) => {
  const db = getDb();
  const id = uuid();
  const data = normalize(input);
  db.insert(policies)
    .values({ id, ...data })
    .run();
  // Don't generate premium installments for matured policies — they're a
  // historical record only.
  if (data.status !== 'matured') {
    regenerateInstallments(id);
  }
  // Auto-create maturity payout repayments — but only for live policies.
  // A matured policy has already paid out; if the user wants to record those
  // historical receipts they can add repayments manually.
  if (data.status !== 'matured') {
    try {
      const { generateMaturityRepayments } = require('./repayments') as typeof import('./repayments');
      generateMaturityRepayments(id);
    } catch (err) {
      console.error('[policies] maturity repayment sync failed', err);
    }
  }
  return id;
};

export const updatePolicy = (id: string, input: PolicyFormInput) => {
  const db = getDb();
  const before = getPolicy(id);
  if (!before) throw new Error('Policy not found');
  const data = normalize(input);
  db.update(policies)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(policies.id, id))
    .run();

  const scheduleChanged =
    before.commencementDate !== data.commencementDate ||
    before.paymentMode !== data.paymentMode ||
    before.premiumPaymentTermMonths !== data.premiumPaymentTermMonths ||
    before.premiumAmount !== data.premiumAmount;

  if (scheduleChanged && data.status !== 'matured') {
    regenerateInstallments(id);
  }

  // Auto-sync maturity repayments if any maturity-related field changed.
  const maturityChanged =
    before.maturityDate !== data.maturityDate ||
    before.maturityType !== data.maturityType ||
    before.maturityFrequency !== data.maturityFrequency ||
    before.sumAssured !== data.sumAssured;

  if (maturityChanged && data.status !== 'matured') {
    try {
      const { generateMaturityRepayments } = require('./repayments') as typeof import('./repayments');
      generateMaturityRepayments(id);
    } catch (err) {
      console.error('[policies] auto maturity-sync on update failed', err);
    }
  }
};

// Soft-delete: marks deleted_at = now. Auto-purged after 90 days at app start.
export const deletePolicy = (id: string) => {
  const db = getDb();
  db.update(policies)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(policies.id, id))
    .run();
};

export const restorePolicy = (id: string) => {
  const db = getDb();
  db.update(policies).set({ deletedAt: null }).where(eq(policies.id, id)).run();
};

// Permanent delete. Wipes the policy AND every repayment linked to it,
// so we don't leave behind orphan "blank policy no" rows in the Repayments
// tab. (premium_payments are removed automatically by the ON DELETE
// CASCADE on that table; repayments use ON DELETE SET NULL, so we delete
// them explicitly here.) Standalone repayments (policy_id IS NULL) are
// not touched.
export const purgePolicy = (id: string) => {
  const sqlite = getRawSqlite();
  const tx = sqlite.transaction((policyId: string) => {
    sqlite.prepare('DELETE FROM repayments WHERE policy_id = ?').run(policyId);
    sqlite.prepare('DELETE FROM policies WHERE id = ?').run(policyId);
  });
  tx(id);
};

export const countActivePolicies = () => {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(policies)
    .where(and(eq(policies.status, 'active'), isNull(policies.deletedAt)))
    .get();
  return row?.c ?? 0;
};

// Regenerate only `pending` rows; preserve paid history.
export const regenerateInstallments = (policyId: string) => {
  const db = getDb();
  const p = getPolicy(policyId);
  if (!p) return;

  const desired = generateInstallments(
    p.commencementDate,
    p.paymentMode,
    p.premiumPaymentTermMonths,
  );

  const existing = db
    .select()
    .from(premiumPayments)
    .where(eq(premiumPayments.policyId, policyId))
    .all();

  const byInstallment = new Map(existing.map((r) => [r.installmentNo, r]));

  for (const inst of desired) {
    const existingRow = byInstallment.get(inst.installmentNo);
    if (existingRow) {
      if (existingRow.status === 'pending') {
        db.update(premiumPayments)
          .set({
            dueDate: inst.dueDate,
            expectedAmount: p.premiumAmount,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(premiumPayments.id, existingRow.id))
          .run();
      }
      byInstallment.delete(inst.installmentNo);
    } else {
      db.insert(premiumPayments)
        .values({
          id: uuid(),
          policyId,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          expectedAmount: p.premiumAmount,
          status: 'pending',
        })
        .run();
    }
  }

  // Any remaining pending rows past the new term: drop them.
  for (const leftover of byInstallment.values()) {
    if (leftover.status === 'pending') {
      db.delete(premiumPayments).where(eq(premiumPayments.id, leftover.id)).run();
    }
  }
};

export const countPremiumsDueInRange = (fromIso: string, toIso: string) => {
  const db = getDb();
  // Exclude payments whose policy is in the recycle bin.
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(premiumPayments)
    .innerJoin(policies, eq(premiumPayments.policyId, policies.id))
    .where(
      and(
        eq(premiumPayments.status, 'pending'),
        gte(premiumPayments.dueDate, fromIso),
        lte(premiumPayments.dueDate, toIso),
        isNull(policies.deletedAt),
      ),
    )
    .get();
  return row?.c ?? 0;
};
