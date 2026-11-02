// Approve or reject a pending request straight from the Dashboard (Misbah), so an admin needs
// no more than 3 clicks (SRS usability requirement). It calls Hamza's approval endpoints:
// PATCH /api/approvals/:id/approve and PATCH /api/approvals/:id/reject { reason }.
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import api from '../../api/client';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorBox, Label, Textarea,
  Tooltip, TooltipContent, TooltipTrigger,
} from '../../components/ui';
import { fmtDate } from './format';

function Summary({ request }) {
  return (
    <dl className="bg-secondary/60 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl p-4 text-sm">
      <dt className="text-muted-foreground">Member</dt><dd className="font-medium">{request.user_name}</dd>
      <dt className="text-muted-foreground">Asset</dt><dd className="font-medium">{request.asset_name}</dd>
      <dt className="text-muted-foreground">Dates</dt>
      <dd>{fmtDate(request.start_date)}{request.end_date !== request.start_date && <> to {fmtDate(request.end_date)}</>}</dd>
      <dt className="text-muted-foreground">Purpose</dt><dd className="break-words">{request.purpose}</dd>
    </dl>
  );
}

export default function QuickDecision({ request, onDone }) {
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | null
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function open(next) {
    setMode(next);
    setReason('');
    setError(null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'approve') {
        await api.patch(`/approvals/${request.request_id}/approve`);
        toast.success(`Approved ${request.asset_name} for ${request.user_name}`);
      } else {
        await api.patch(`/approvals/${request.request_id}/reject`, { reason: reason.trim() });
        toast.success(`Rejected the request from ${request.user_name}`);
      }
      setMode(null);
      onDone?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const approving = mode === 'approve';
  return (
    <>
      <div className="flex justify-end gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label={`Approve request from ${request.user_name}`} onClick={() => open('approve')}>
              <Check />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Approve</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="hover:text-danger" aria-label={`Reject request from ${request.user_name}`} onClick={() => open('reject')}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reject</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && !busy && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{approving ? 'Approve this request?' : 'Reject this request?'}</DialogTitle>
              <DialogDescription>
                {approving
                  ? 'The asset is reserved for these dates and the member is notified.'
                  : 'The member is notified with your reason.'}
              </DialogDescription>
            </DialogHeader>
            <Summary request={request} />
            {!approving && (
              <div className="space-y-2">
                <Label htmlFor={`reason-${request.request_id}`}>Reason</Label>
                <Textarea
                  id={`reason-${request.request_id}`}
                  required
                  maxLength={255}
                  placeholder="For example: the asset is booked for a workshop on these dates"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            <ErrorBox error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant={approving ? 'brand' : 'destructive'} disabled={busy || (!approving && !reason.trim())}>
                {busy ? <Loader2 className="animate-spin" /> : approving ? <Check /> : <X />}
                {approving ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
