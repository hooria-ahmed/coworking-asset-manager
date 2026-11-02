// Owner: Hooria. Route: /ai/recommend (registered in src/routes.jsx - do not rename this file or its export).
// AI Recommendation (FR-RC-01, FR-RC-04 to FR-RC-06). The user describes what they need; Misbah's
// POST /api/ai/recommend returns up to 5 free assets in rank order, each with a reason.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarSearch, Info, Loader2, MapPin, SearchX, Wand2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardIcon,
  CardTitle,
  DotPill,
  EmptyState,
  ErrorBox,
  Input,
  Label,
  Page,
  Skeleton,
  Textarea,
} from '../../components/ui';
import { fmtDate, plural, todayISO } from '../reports/format';
import { AssetThumb } from '../assets/parts';

const MAX_REQUIREMENT = 500; // FR-RC-01
const MAX_PURPOSE = 255;

export default function RecommendPage() {
  const { user } = useAuth();
  const isMember = user.role === 'Member';
  const [form, setForm] = useState({
    requirement: '',
    purpose: '',
    start_date: todayISO(),
    duration_days: 1,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function search(values = form) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.post('/ai/recommend', { ...values, duration_days: Number(values.duration_days) }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    search();
  }

  // FR-RC-06: try again from the nearest date the server suggested.
  function searchFrom(date) {
    const next = { ...form, start_date: date };
    setForm(next);
    search(next);
  }

  return (
    <Page
      title="AI"
      accent="recommendation"
      description="Describe what you need and when. The AI picks the best free assets and says why."
    >
      <div className="grid items-start gap-4 lg:grid-cols-[24rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <CardIcon icon={Wand2} /> What do you need?
            </CardTitle>
            <CardDescription>
              For example: "a laptop for video editing" or "a projector for a 20-person workshop".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="requirement">Requirement</Label>
                <Textarea
                  id="requirement"
                  rows={4}
                  maxLength={MAX_REQUIREMENT}
                  value={form.requirement}
                  onChange={set('requirement')}
                  placeholder="Laptop for video editing"
                  required
                />
                <p className="text-muted-foreground text-right text-xs tabular-nums">
                  {form.requirement.length} / {MAX_REQUIREMENT}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Input
                  id="purpose"
                  maxLength={MAX_PURPOSE}
                  value={form.purpose}
                  onChange={set('purpose')}
                  placeholder="Client video project"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    min={todayISO()}
                    value={form.start_date}
                    onChange={set('start_date')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration_days">Days</Label>
                  <Input
                    id="duration_days"
                    type="number"
                    min={1}
                    max={30}
                    value={form.duration_days}
                    onChange={set('duration_days')}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="brand"
                className="w-full"
                disabled={loading || !form.requirement.trim()}
              >
                {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {loading ? 'Finding the best match...' : 'Recommend assets'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <ErrorBox error={error} />

          {loading && (
            <>
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> The AI is comparing free assets. This can take up to 10 seconds.
              </p>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-3xl" />
              ))}
            </>
          )}

          {!loading && !result && !error && (
            <Card>
              <EmptyState icon={Wand2} title="Your recommendations will appear here">
                Fill in the form and press Recommend assets.
              </EmptyState>
            </Card>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <DotPill tone="brand">
                  {fmtDate(result.start_date)} to {fmtDate(result.end_date)}
                </DotPill>
                <DotPill tone="neutral">{plural(result.duration_days, 'day')}</DotPill>
                {result.source === 'rules' && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Info className="size-3.5" /> Ranked by keyword match (the AI was not used)
                  </span>
                )}
              </div>

              {result.recommendations.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={SearchX}
                    title="Nothing suitable is free"
                    action={
                      result.nearest_date && (
                        <Button variant="outline" onClick={() => searchFrom(result.nearest_date)}>
                          <CalendarSearch /> Search from {fmtDate(result.nearest_date)}
                        </Button>
                      )
                    }
                  >
                    {result.message || 'No free asset matches these dates.'}
                  </EmptyState>
                </Card>
              ) : (
                result.recommendations.map(({ rank, reason, asset }) => (
                  <Card key={asset.asset_id} className="flex-row items-stretch gap-4 p-4">
                    <div className="relative w-28 shrink-0 sm:w-40">
                      <AssetThumb asset={asset} className="h-full" />
                      <span
                        className={`absolute top-2 left-2 flex size-7 items-center justify-center rounded-full text-xs font-bold ${rank <= 3 ? 'bg-highlight text-highlight-foreground' : 'bg-secondary'}`}
                      >
                        {rank}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div>
                        <Link
                          to={`/assets/${asset.asset_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display text-lg font-medium hover:underline"
                        >
                          {asset.name}
                        </Link>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                          <span>{asset.category}</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {asset.location}
                          </span>
                          <Badge variant="pill">{asset.condition}</Badge>
                        </p>
                      </div>

                      <p className="text-sm">{reason}</p>

                      {isMember && (
                        <div className="mt-auto">
                          <Button asChild size="sm">
                            <Link
                              to={`/request/${asset.asset_id}?start=${result.start_date}&days=${result.duration_days}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Request <ArrowUpRight />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
