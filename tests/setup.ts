import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * With `globals: false`, Testing Library does not auto-register its cleanup,
 * so every render would stack up in the same document and turn every
 * single-element query into an ambiguous match.
 */
afterEach(() => { cleanup(); });
