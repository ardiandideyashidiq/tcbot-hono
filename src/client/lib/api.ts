import { hc } from 'hono/client';
import type { AppType } from '../../index';

export const api = hc<AppType>('/');
