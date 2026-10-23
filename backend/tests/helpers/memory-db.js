// In-memory test double for the subset of the MongoDB Node driver used by SplitWisee.
// It lets the HTTP tests drive the real Express app end to end. It is NOT evidence about a real MongoDB server:
// there are no validators, TTL expiry, real transactions/isolation or network failures. Real-database checks live in
// backend/tests/mongodb.integration.test.mjs (opt-in via MONGODB_TEST_URI).
const tick = () => new Promise((r) => setImmediate(r)); // every call yields, so concurrent requests interleave
let seq = 0;
class FakeObjectId {
  constructor() {
    this.id = (++seq).toString(16).padStart(24, "0");
  }
  toString() {
    return this.id;
  }
}
const isOperatorObject = (v) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  Object.keys(v).length > 0 &&
  Object.keys(v).every((k) => k.startsWith("$"));
const plain = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof FakeObjectId);

function equal(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && +a === +b;
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => equal(a[k], b[k]));
  }
  return false;
}
// All values reachable at a dotted path, traversing arrays like MongoDB does.
function values(doc, path) {
  let out = [doc];
  for (const part of path.split(".")) {
    const next = [];
    for (const v of out) {
      if (Array.isArray(v) && !/^\d+$/.test(part)) for (const x of v) next.push(x?.[part]);
      else next.push(v == null ? undefined : v[part]);
    }
    out = next;
  }
  return out;
}
const flatten = (vals) => vals.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]));
const comparable = (a, b) =>
  (a instanceof Date && b instanceof Date) ||
  (typeof a === typeof b && ["number", "string"].includes(typeof a));
const cmp = (a, b) => (a instanceof Date ? +a - +b : a < b ? -1 : a > b ? 1 : 0);
function fieldMatches(doc, path, cond) {
  const vals = values(doc, path),
    all = flatten(vals);
  const eq = (target) =>
    target === null
      ? all.some((v) => v == null) || vals.every((v) => v === undefined)
      : all.some((v) => equal(v, target));
  if (!isOperatorObject(cond)) return eq(cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case "$eq":
        return eq(arg);
      case "$ne":
        return !eq(arg);
      case "$gt":
        return all.some((v) => v != null && comparable(v, arg) && cmp(v, arg) > 0);
      case "$gte":
        return all.some((v) => v != null && comparable(v, arg) && cmp(v, arg) >= 0);
      case "$lt":
        return all.some((v) => v != null && comparable(v, arg) && cmp(v, arg) < 0);
      case "$lte":
        return all.some((v) => v != null && comparable(v, arg) && cmp(v, arg) <= 0);
      case "$in":
        return arg.some((x) => eq(x));
      case "$nin":
        return !arg.some((x) => eq(x));
      case "$exists":
        return vals.some((v) => v !== undefined) === !!arg;
      case "$elemMatch":
        return vals.some((v) => Array.isArray(v) && v.some((el) => matches(el, arg)));
      default:
        throw Error("memory-db: unsupported query operator " + op);
    }
  });
}
function expr(doc, e) {
  const val = (x) => (typeof x === "string" && x.startsWith("$") ? values(doc, x.slice(1))[0] : x);
  const [op] = Object.keys(e),
    [a, b] = e[op].map(val);
  if (op === "$lt") return a < b;
  if (op === "$lte") return a <= b;
  if (op === "$gt") return a > b;
  if (op === "$gte") return a >= b;
  if (op === "$eq") return equal(a, b);
  throw Error("memory-db: unsupported $expr " + op);
}
function matches(doc, query = {}) {
  return Object.entries(query).every(([k, cond]) => {
    if (k === "$or") return cond.some((q) => matches(doc, q));
    if (k === "$and") return cond.every((q) => matches(doc, q));
    if (k === "$expr") return expr(doc, cond);
    return fieldMatches(doc, k, cond);
  });
}
function setPath(doc, path, value) {
  const parts = path.split("."),
    last = parts.pop();
  let o = doc;
  for (const p of parts) o = o[p] ??= {};
  o[last] = value;
}
function unsetPath(doc, path) {
  const parts = path.split("."),
    last = parts.pop();
  let o = doc;
  for (const p of parts) if (!(o = o?.[p])) return;
  delete o[last];
}
function applyUpdate(doc, update, inserting) {
  for (const [op, fields] of Object.entries(update)) {
    if (op === "$setOnInsert" && !inserting) continue;
    for (const [path, v] of Object.entries(fields)) {
      if (op === "$set" || op === "$setOnInsert") setPath(doc, path, structuredClone(v));
      else if (op === "$unset") unsetPath(doc, path);
      else if (op === "$inc") setPath(doc, path, (values(doc, path)[0] || 0) + v);
      else if (op === "$push") {
        const arr = values(doc, path)[0] || [];
        const items = plain(v) && "$each" in v ? v.$each : [v],
          at = plain(v) && "$position" in v ? v.$position : arr.length;
        arr.splice(at, 0, ...structuredClone(items));
        setPath(doc, path, arr);
      } else throw Error("memory-db: unsupported update operator " + op);
    }
  }
  return doc;
}
function project(doc, projection) {
  if (!doc || !projection) return doc;
  const entries = Object.entries(projection),
    include = entries.filter(([k, v]) => v && k !== "_id").map(([k]) => k);
  const out = include.length
    ? Object.fromEntries(include.filter((k) => k in doc).map((k) => [k, doc[k]]))
    : { ...doc };
  if (include.length && projection._id !== 0 && "_id" in doc) out._id = doc._id;
  for (const [k, v] of entries) if (!v) delete out[k];
  return out;
}
const duplicate = (index) =>
  Object.assign(new Error(`E11000 duplicate key error (memory-db) index: ${index}`), {
    code: 11000,
    name: "MongoServerError",
  });

class Cursor {
  constructor(rows, projection) {
    this.rows = rows;
    this.projection = projection;
  }
  sort(spec) {
    const keys = Object.entries(spec);
    this.rows.sort((a, b) => {
      for (const [k, dir] of keys) {
        const x = values(a, k)[0],
          y = values(b, k)[0];
        if (x === y) continue;
        if (x == null) return -dir;
        if (y == null) return dir;
        return cmp(x, y) * dir;
      }
      return 0;
    });
    return this;
  }
  limit(n) {
    if (n) this.rows = this.rows.slice(0, n);
    return this;
  }
  project(p) {
    this.projection = p;
    return this;
  }
  async toArray() {
    await tick();
    return this.rows.map((r) => project(structuredClone(r), this.projection));
  }
  async *[Symbol.asyncIterator]() {
    for (const r of await this.toArray()) yield r;
  }
}

class Collection {
  constructor(name) {
    this.name = name;
    this.docs = [];
    this.indexes = [{ name: "_id_", key: { _id: 1 } }];
  }
  checkUnique(candidate, ignore) {
    for (const ix of this.indexes.filter((i) => i.unique)) {
      const fields = Object.keys(ix.key),
        key = fields.map((f) => values(candidate, f)[0]);
      if (ix.sparse && key.every((v) => v === undefined)) continue;
      if (
        this.docs.some(
          (d) => d !== ignore && fields.every((f, i) => equal(values(d, f)[0] ?? null, key[i] ?? null)),
        )
      )
        throw duplicate(ix.name);
    }
  }
  async createIndex(key, options = {}) {
    await tick();
    const name = Object.entries(key)
      .map(([k, v]) => `${k}_${v}`)
      .join("_");
    if (!this.indexes.some((i) => i.name === name)) this.indexes.push({ name, key, ...options });
    return name;
  }
  listIndexes() {
    return { toArray: async () => structuredClone(this.indexes) };
  }
  async dropIndex(name) {
    this.indexes = this.indexes.filter((i) => i.name !== name);
  }
  async insertOne(doc) {
    await tick();
    doc._id ??= new FakeObjectId(); // the real driver mutates the inserted object the same way
    const stored = structuredClone(doc);
    this.checkUnique(stored);
    this.docs.push(stored);
    return { acknowledged: true, insertedId: doc._id };
  }
  async findOne(query, options = {}) {
    await tick();
    const d = this.docs.find((x) => matches(x, query));
    return d ? project(structuredClone(d), options.projection) : null;
  }
  find(query = {}, options = {}) {
    return new Cursor(
      this.docs.filter((x) => matches(x, query)),
      options.projection,
    );
  }
  async countDocuments(query = {}) {
    await tick();
    return this.docs.filter((x) => matches(x, query)).length;
  }
  upsertSeed(filter) {
    return Object.fromEntries(
      Object.entries(filter)
        .filter(([k, v]) => !k.startsWith("$") && !isOperatorObject(v))
        .map(([k, v]) => [k, structuredClone(v)]),
    );
  }
  write(target, update, upsert, filter) {
    if (target) {
      const next = applyUpdate(structuredClone(target), update, false);
      this.checkUnique(next, target);
      Object.keys(target).forEach((k) => delete target[k]);
      Object.assign(target, next);
      return { doc: target, upserted: false };
    }
    if (!upsert) return { doc: null, upserted: false };
    const doc = applyUpdate(this.upsertSeed(filter), update, true);
    doc._id ??= new FakeObjectId();
    this.checkUnique(doc);
    this.docs.push(doc);
    return { doc, upserted: true };
  }
  async updateOne(filter, update, options = {}) {
    await tick();
    const target = this.docs.find((x) => matches(x, filter)),
      { upserted } = this.write(target, update, options.upsert, filter);
    return {
      acknowledged: true,
      matchedCount: target ? 1 : 0,
      modifiedCount: target ? 1 : 0,
      upsertedCount: upserted ? 1 : 0,
    };
  }
  async updateMany(filter, update) {
    await tick();
    const list = this.docs.filter((x) => matches(x, filter));
    for (const d of list) this.write(d, update, false, filter);
    return { matchedCount: list.length, modifiedCount: list.length };
  }
  async replaceOne(filter, replacement) {
    await tick();
    const target = this.docs.find((x) => matches(x, filter));
    if (!target) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const next = { ...structuredClone(replacement), _id: target._id };
    this.checkUnique(next, target);
    this.docs[this.docs.indexOf(target)] = next;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }
  async findOneAndUpdate(filter, update, options = {}) {
    await tick();
    const target = this.docs.find((x) => matches(x, filter)),
      before = target ? structuredClone(target) : null;
    const { doc } = this.write(target, update, options.upsert, filter);
    const out = options.returnDocument === "after" ? doc && structuredClone(doc) : before;
    return project(out, options.projection);
  }
  async findOneAndDelete(filter) {
    await tick();
    const i = this.docs.findIndex((x) => matches(x, filter));
    return i < 0 ? null : this.docs.splice(i, 1)[0];
  }
  async deleteOne(filter) {
    await tick();
    const i = this.docs.findIndex((x) => matches(x, filter));
    if (i >= 0) this.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }
  async deleteMany(filter) {
    await tick();
    const before = this.docs.length;
    this.docs = this.docs.filter((x) => !matches(x, filter));
    return { deletedCount: before - this.docs.length };
  }
}

export function createMemoryDb(name = "splitwisee_test") {
  const collections = new Map();
  const db = {
    databaseName: name,
    collection(n) {
      if (!collections.has(n)) collections.set(n, new Collection(n));
      return collections.get(n);
    },
    async command(cmd) {
      await tick();
      if (cmd.ping || cmd.collMod) return { ok: 1 };
      throw Error("memory-db: unsupported command");
    },
    listCollections(filter = {}) {
      return { hasNext: async () => collections.has(filter.name) };
    },
    async createCollection(n) {
      db.collection(n);
      return db.collection(n);
    },
    // Runs the callback once; no isolation or rollback (unlike a real replica-set transaction).
    client: { startSession: () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }) },
    raw: collections,
  };
  return db;
}
