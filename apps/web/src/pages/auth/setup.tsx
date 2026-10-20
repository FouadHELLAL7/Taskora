import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrfToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { AuthCard } from './login';

const ZONES = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Europe/Brussels', 'Europe/London', 'America/New_York'];
  }
})();

export default function SetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['setup-status'], queryFn: () => api.get<{ needsSetup: boolean }>('/setup/status') });
  const [form, setForm] = useState({
    setupToken: '',
    organizationName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (status.data && !status.data.needsSetup) return <Navigate to="/login" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (form.password !== form.confirm) return setErrors({ confirm: 'Passwords do not match' });
    setLoading(true);
    try {
      const { confirm: _c, ...payload } = form;
      const res = await api.post<{ csrfToken: string }>('/setup', payload);
      setCsrfToken(res.csrfToken);
      await qc.invalidateQueries();
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: Object.keys(err.fields).length ? '' : err.message });
    } finally {
      setLoading(false);
    }
  };

  const field = (k: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={set(k)} aria-invalid={!!errors[k]} required {...props} />
      {errors[k] && <p className="mt-1 text-[11px] text-danger">{errors[k]}</p>}
    </div>
  );

  return (
    <AuthCard title="Welcome to Taskora" subtitle="Create the first administrator account. The setup token is printed in the API logs (docker compose logs api | grep 'setup token').">
      <form onSubmit={submit} className="space-y-3">
        {field('setupToken', 'Setup token', { autoComplete: 'off', autoFocus: true })}
        {field('organizationName', 'Organization name')}
        <div className="grid grid-cols-2 gap-3">
          {field('firstName', 'First name')}
          {field('lastName', 'Last name')}
        </div>
        {field('email', 'E-mail', { type: 'email', autoComplete: 'username' })}
        {field('password', 'Password', { type: 'password', autoComplete: 'new-password' })}
        {field('confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}
        <div>
          <Label>Time zone</Label>
          <Select value={form.timezone} onChange={set('timezone')} options={ZONES.map((z) => ({ value: z, label: z }))} />
        </div>
        {errors._ && <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{errors._}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Create administrator
        </Button>
      </form>
    </AuthCard>
  );
}
