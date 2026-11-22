// The API returns one message per problem; point it at the form field it is about.
export function fieldForError(err) {
  const msg = (err.message || '').toLowerCase();
  if (err.status === 409 || msg.includes('gmail') || msg.includes('email') || msg.includes('username')) return 'email';
  if (msg.includes('display')) return 'displayName';
  if (msg.includes('code')) return 'code';
  if (msg.includes('password')) return err.status === 401 ? 'form' : 'password';
  return 'form';
}
