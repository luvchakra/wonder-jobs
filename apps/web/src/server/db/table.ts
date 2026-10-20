/**
 * A small table helper for the hiring-workspace tables (organizations, members, jobs, shortlists, messages). Every
 * read, update and delete takes an explicit `where` — there is no unfiltered call — so the caller always names the
 * org or tenant it is scoped to (RLS has no policies; CLAUDE.md). With Supabase configured it uses the service-role
 * client; without (local, tests) an in-memory table per process.
 */
import { getSupabaseAdmin } from "../supabase";

type Row = Record<string, unknown>;

export interface FindOptions {
  order?: string;
  desc?: boolean;
  limit?: number;
}

export interface Table<T extends Row> {
  find(where: Partial<T>, opts?: FindOptions): Promise<T[]>;
  one(where: Partial<T>): Promise<T | undefined>;
  /** Rows whose `column` is any of `values`, within `where`. */
  findIn(column: keyof T & string, values: string[], where?: Partial<T>, opts?: FindOptions): Promise<T[]>;
  /**
   * Every row, newest first by `order`. Only for tables whose rows are meant to be read across tenants: talent
   * profiles, which exist only while a candidate chose to show them to recruiters.
   */
  all(opts: FindOptions & { order: string; limit: number }): Promise<T[]>;
  insert(row: T): Promise<T>;
  update(where: Partial<T>, patch: Partial<T>): Promise<number>;
  remove(where: Partial<T>): Promise<number>;
}

function requireWhere(where: Row) {
  if (!Object.keys(where).length) throw new Error("Refusing an unfiltered query");
}

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);

const g = globalThis as unknown as { __wjTables?: Map<string, Row[]> };
const memory = () => (g.__wjTables ??= new Map());

class MemoryTable<T extends Row> implements Table<T> {
  constructor(private name: string) {}
  private rows(): T[] {
    const m = memory();
    if (!m.has(this.name)) m.set(this.name, []);
    return m.get(this.name) as T[];
  }
  private sort(list: T[], opts?: FindOptions) {
    let out = [...list];
    if (opts?.order) {
      const k = opts.order;
      out.sort((a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? "")) * (opts.desc ? -1 : 1));
    }
    if (opts?.limit) out = out.slice(0, opts.limit);
    return out;
  }
  async find(where: Partial<T>, opts?: FindOptions) {
    requireWhere(where);
    return this.sort(this.rows().filter((r) => matches(r, where)), opts);
  }
  async one(where: Partial<T>) {
    return (await this.find(where, { limit: 1 }))[0];
  }
  async findIn(column: keyof T & string, values: string[], where: Partial<T> = {}, opts?: FindOptions) {
    if (!values.length) return [];
    return this.sort(this.rows().filter((r) => values.includes(String(r[column])) && matches(r, where)), opts);
  }
  async all(opts: FindOptions & { order: string; limit: number }) {
    return this.sort(this.rows(), opts);
  }
  async insert(row: T) {
    this.rows().push({ ...row });
    return row;
  }
  async update(where: Partial<T>, patch: Partial<T>) {
    requireWhere(where);
    let n = 0;
    for (const r of this.rows()) {
      if (!matches(r, where)) continue;
      Object.assign(r, patch);
      n++;
    }
    return n;
  }
  async remove(where: Partial<T>) {
    requireWhere(where);
    const rows = this.rows();
    const keep = rows.filter((r) => !matches(r, where));
    const n = rows.length - keep.length;
    memory().set(this.name, keep);
    return n;
  }
}

class SupabaseTable<T extends Row> implements Table<T> {
  constructor(private name: string) {}
  private q() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.from(this.name);
  }
  private fail(what: string, message: string): never {
    throw new Error(`Could not ${what} ${this.name.replace(/_/g, " ")}: ${message}`);
  }
  async find(where: Partial<T>, opts?: FindOptions) {
    requireWhere(where);
    let q = this.q().select("*");
    for (const [k, v] of Object.entries(where)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
    if (opts?.order) q = q.order(opts.order, { ascending: !opts.desc });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) this.fail("read", error.message);
    return (data ?? []) as unknown as T[];
  }
  async one(where: Partial<T>) {
    return (await this.find(where, { limit: 1 }))[0];
  }
  async findIn(column: keyof T & string, values: string[], where: Partial<T> = {}, opts?: FindOptions) {
    if (!values.length) return [];
    let q = this.q().select("*").in(column, values as never[]);
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as string);
    if (opts?.order) q = q.order(opts.order, { ascending: !opts.desc });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) this.fail("read", error.message);
    return (data ?? []) as unknown as T[];
  }
  async all(opts: FindOptions & { order: string; limit: number }) {
    const { data, error } = await this.q().select("*").order(opts.order, { ascending: !opts.desc }).limit(opts.limit);
    if (error) this.fail("read", error.message);
    return (data ?? []) as unknown as T[];
  }
  async insert(row: T) {
    const { error } = await this.q().insert(row as never);
    if (error) this.fail("save", error.message);
    return row;
  }
  async update(where: Partial<T>, patch: Partial<T>) {
    requireWhere(where);
    let q = this.q().update(patch as never);
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as string);
    const { data, error } = await q.select("*");
    if (error) this.fail("update", error.message);
    return (data ?? []).length;
  }
  async remove(where: Partial<T>) {
    requireWhere(where);
    let q = this.q().delete();
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as string);
    const { data, error } = await q.select("*");
    if (error) this.fail("remove", error.message);
    return (data ?? []).length;
  }
}

export function table<T extends Row>(name: string): Table<T> {
  return getSupabaseAdmin() ? new SupabaseTable<T>(name) : new MemoryTable<T>(name);
}

/** Tests. */
export function resetTablesForTests() {
  g.__wjTables = new Map();
}
