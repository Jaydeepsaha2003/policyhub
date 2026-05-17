import { v4 as uuid } from 'uuid';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { policies, premiumPayments } from '../../shared/db/schema';
import { generateInstallments } from '../../shared/installments';
import { rupeesToPaise, type PolicyFormInput } from '../../shared/types';

export const listPolicies = () => {
  const db = getDb();
  return db.select().from(policies).orderBy(asc(policies.policyHolder)).all();
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
  policyTermYears: input.policyTermYears,
  premiumPaymentTermYears: input.premiumPaymentTermYears,
  branchName: input.branchName?.trim() || null,
  agentName: input.agentName?.trim() || null,
  agentContact: input.agentContact?.trim() || null,
  status: input.status ?? 'active',
  notes: input.notes?.trim() || null,
});

export const createPolicy = (input: PolicyFormInput) => {
  const db = getDb();
  const id = uuid();
  const data = normalize(input);
  db.insert(policies)
    .values({ id, ...data })
    .run();
  regenerateInstallments(id);
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
    before.premiumPaymentTermYears !== data.premiumPaymentTermYears ||
    before.premiumAmount !== data.premiumAmount;

  if (scheduleChanged) {
    regenerateInstallments(id);
  }
};

export const deletePolicy = (id: string) => {
  const db = getDb();
  db.delete(policies).where(eq(policies.id, id)).run();
};

// Regenerate only `pending` rows; preserve paid history.
export const regenerateInstallments = (policyId: string) => {
  const db = getDb();
  const p = getPolicy(policyId);
  if (!p) return;

  const desired = generateInstallments(
    p.commencementDate,
    p.paymentMode,
    p.premiumPaymentTermYears,
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

export const countActivePolicies = () => {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(policies)
    .where(eq(policies.status, 'active'))
    .get();
  return row?.c ?? 0;
};

export const countPremiumsDueInRange = (fromIso: string, toIso: string) => {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(premiumPayments)
    .where(
      and(
        eq(premiumPayments.status, 'pending'),
        gte(premiumPayments.dueDate, fromIso),
        lte(premiumPayments.dueDate, toIso),
      ),
    )
    .get();
  return row?.c ?? 0;
};
