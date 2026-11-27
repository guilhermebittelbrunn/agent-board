/**
 * A session's last-seen stamp is written at most once per window, so the window is the
 * precision of that field: at 15 minutes, "last seen" can be up to 15 minutes behind.
 */
export const ACTIVITY_WINDOW_MINUTES = 15;
