import { ulid } from 'ulid';
// Prefixed, sortable IDs (e.g. usr_01H..., evt_01H...).
export const newId = (prefix: string) => `${prefix}_${ulid()}`;
