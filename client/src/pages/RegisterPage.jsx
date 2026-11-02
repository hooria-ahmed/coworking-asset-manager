// Registration screen (FR-AU-01, FR-AU-02). Owner: integrator.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, UserPlus } from 'lucide-react';
import api from '../api/client';
import { Button, ErrorBox, Input, Label } from '../components/ui';
import AuthLayout from './AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', contact_no: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/register', form);
      navigate('/login');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Join the space to request and borrow shared assets."
      footer={<>Already registered? <Link to="/login" className="text-foreground font-medium underline-offset-4 hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={error} />
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" required minLength={2} maxLength={100} value={form.name} onChange={set('name')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" required value={form.email} onChange={set('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact">Contact number <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="contact" type="tel" placeholder="+923001234567" pattern="\+?[0-9]{10,15}" value={form.contact_no} onChange={set('contact_no')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        </div>
        <Button size="lg" className="w-full" disabled={busy}>
          {busy ? <><Loader2 className="animate-spin" /> Creating account...</> : <><UserPlus /> Create account</>}
        </Button>
      </form>
    </AuthLayout>
  );
}
