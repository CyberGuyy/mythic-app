import Login from '@/components/Login.jsx';

export const metadata = { title: 'Sign in · Mythic' };

export default async function LoginPage({ searchParams }) {
  const next = (await searchParams)?.next;
  return <Login next={typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/dash'} />;
}
