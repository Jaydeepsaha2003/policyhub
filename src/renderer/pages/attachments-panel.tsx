import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Paperclip, Plus, Trash2, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type Attachment = {
  id: string;
  fileName: string;
  storedName: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedAt: string;
  description: string | null;
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const iconFor = (mime: string | null) => {
  if (!mime) return <Paperclip className="h-5 w-5 text-muted-foreground" />;
  if (mime.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-violet-500" />;
  if (mime === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
  return <Paperclip className="h-5 w-5 text-muted-foreground" />;
};

export const AttachmentsPanel = ({ policyId }: { policyId: string }) => {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = (await window.policyhub.attachments.list(policyId)) as Attachment[];
      setRows(list);
    } catch (err) {
      toast.error('Failed to load attachments', { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (policyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyId]);

  const onAdd = async () => {
    setAdding(true);
    try {
      const result = await window.policyhub.attachments.add(policyId);
      if (result === null) return; // user canceled the dialog
      if (result.added > 0) {
        toast.success(
          result.added === 1 ? 'File attached' : `${result.added} files attached`,
        );
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} file(s) failed`, {
          description: result.errors.map((e) => `${e.fileName}: ${e.reason}`).join('\n'),
        });
      }
      await load();
    } catch (err) {
      toast.error('Upload failed', { description: (err as Error).message });
    } finally {
      setAdding(false);
    }
  };

  const onOpen = async (id: string) => {
    try {
      await window.policyhub.attachments.open(id);
    } catch (err) {
      toast.error('Could not open file', { description: (err as Error).message });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await window.policyhub.attachments.remove(id);
      toast.success('Attachment deleted');
      await load();
    } catch (err) {
      toast.error('Delete failed', { description: (err as Error).message });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Upload policy copies as PDF or image files (up to 25 MB each). They're stored
          locally with the database.
        </div>
        <Button onClick={onAdd} disabled={adding}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add file
        </Button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Paperclip className="h-6 w-6" />
            <div>No files attached yet.</div>
            <div className="text-xs">PDF, JPG, PNG, WebP, HEIC are supported.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex items-center gap-3 p-3">
                {iconFor(row.mimeType)}
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  className="flex flex-1 flex-col items-start text-left hover:underline"
                >
                  <span className="text-sm font-medium">{row.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(row.sizeBytes)} · uploaded {formatDate(row.uploadedAt)}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onOpen(row.id)}
                  title="Open in default viewer"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this attachment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {row.fileName} will be removed permanently from this policy.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(row.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
