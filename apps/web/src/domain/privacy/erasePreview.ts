/** What deleting an account will do, in the person's own numbers (server/privacy/erasePreview.ts fills it). */
export interface ErasePreview {
  /** Easy Apply applications sent, and to how many companies. */
  applications: number;
  companies: number;
  /** Requests sent through modules, by module id. */
  requests: Record<string, number>;
  bookings: number;
  /** Hiring workspaces the person owns: handed to another member, or left with nobody (their open jobs close). */
  workspacesHandedOn: number;
  workspacesClosed: number;
  /** Network: connections that end, posts that go. */
  connections: number;
  posts: number;
  /** Communities the person owns: handed to a member, or deleted with their discussions. */
  communitiesHandedOn: number;
  communitiesDeleted: number;
}
