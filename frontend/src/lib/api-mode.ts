/**
 * NEXT_PUBLIC_API_MOCK (Section 2.10.3/2.10.5): "1" makes Mock Service Worker
 * answer every /api/* call in the browser; "0" sends them to the real backend
 * through the /api rewrite in next.config.ts. There is no backend yet, so an
 * unset flag means mocks on — set it to "0" on the 18 October switch-over.
 */
export const API_MOCK = process.env.NEXT_PUBLIC_API_MOCK !== "0";
