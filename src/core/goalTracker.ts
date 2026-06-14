import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

export type GoalStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
export type WorkerType = 'researcher' | 'developer' | 'tester' | 'executor';

export interface Goal {
  id: string;
  user_intent: string;
  task_id: string;
  status: GoalStatus;
  task_count: number;
  completed_count: number;
  created_at: number;
  updated_at: number;
}

export interface GoalTask {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  depends_on: string[];
  status: TaskStatus;
  assigned_worker: WorkerType | null;
  result: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface RawTask {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  depends_on: string;
  status: TaskStatus;
  assigned_worker: WorkerType | null;
  result: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateTaskInput {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  assignedWorker: WorkerType;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.GOAL_TRACKER_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.pragma('foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_intent TEXT NOT NULL,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      task_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goal_tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_worker TEXT,
      result TEXT,
      failure_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_id ON goal_tasks(goal_id);
  `);
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_db) { try { _db.close(); } catch {} _db = null; }
  if (customPath !== undefined) process.env.GOAL_TRACKER_DB_PATH = customPath;
}

function parseTask(raw: RawTask): GoalTask {
  return { ...raw, depends_on: JSON.parse(raw.depends_on || '[]') };
}

export const GoalTracker = {
  createGoal(taskId: string, userIntent: string, tasks: CreateTaskInput[]): Goal {
    const db = getDb();
    const now = Date.now();
    const goalId = crypto.randomUUID();

    const insertGoal = db.prepare(`
      INSERT INTO goals (id, user_intent, task_id, status, task_count, completed_count, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, 0, ?, ?)
    `);
    const insertTask = db.prepare(`
      INSERT INTO goal_tasks (id, goal_id, title, description, depends_on, status, assigned_worker, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `);

    db.transaction(() => {
      insertGoal.run(goalId, userIntent, taskId, tasks.length, now, now);
      for (const t of tasks) {
        insertTask.run(t.id, goalId, t.title, t.description, JSON.stringify(t.dependsOn), t.assignedWorker, now, now);
      }
    })();

    return db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId) as Goal;
  },

  getActiveGoal(taskId: string): Goal | null {
    return (getDb()
      .prepare(`SELECT * FROM goals WHERE task_id = ? AND status = 'active'`)
      .get(taskId) as Goal | undefined) ?? null;
  },

  getNextTask(goalId: string): GoalTask | null {
    const db = getDb();
    const completedIds = (
      db.prepare(`SELECT id FROM goal_tasks WHERE goal_id = ? AND status = 'completed'`).all(goalId) as { id: string }[]
    ).map(r => r.id);

    const pending = (
      db.prepare(`SELECT * FROM goal_tasks WHERE goal_id = ? AND status = 'pending' ORDER BY created_at ASC`).all(goalId) as RawTask[]
    ).map(parseTask);

    return pending.find(t => t.depends_on.every(dep => completedIds.includes(dep))) ?? null;
  },

  startTask(taskId: string): void {
    getDb()
      .prepare(`UPDATE goal_tasks SET status = 'active', updated_at = ? WHERE id = ?`)
      .run(Date.now(), taskId);
  },

  completeTask(taskId: string, result: string): void {
    const db = getDb();
    const now = Date.now();
    const row = db.prepare('SELECT goal_id, status FROM goal_tasks WHERE id = ?').get(taskId) as { goal_id: string; status: string } | undefined;
    if (!row || row.status === 'completed') return;
    db.prepare(`UPDATE goal_tasks SET status = 'completed', result = ?, updated_at = ? WHERE id = ?`).run(result, now, taskId);
    db.prepare(`UPDATE goals SET completed_count = completed_count + 1, updated_at = ? WHERE id = ?`).run(now, row.goal_id);
  },

  failTask(taskId: string, reason: string): void {
    const db = getDb();
    const now = Date.now();
    db.prepare(`UPDATE goal_tasks SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`).run(reason, now, taskId);

    // Get the goal_id to scope cascade to this goal only
    const goalRow = db.prepare('SELECT goal_id FROM goal_tasks WHERE id = ?').get(taskId) as { goal_id: string } | undefined;
    if (!goalRow) return;
    const { goal_id } = goalRow;

    // Iterative cascade: skip all transitively-dependent pending tasks within this goal
    const skipStmt = db.prepare(`UPDATE goal_tasks SET status = 'skipped', updated_at = ? WHERE id = ?`);
    const justFailed = new Set<string>([taskId]);
    while (justFailed.size > 0) {
      const failedNow = new Set<string>();
      const allPending = db.prepare(`SELECT id, depends_on FROM goal_tasks WHERE goal_id = ? AND status = 'pending'`).all(goal_id) as { id: string; depends_on: string }[];
      for (const row of allPending) {
        const deps: string[] = JSON.parse(row.depends_on || '[]');
        if (deps.some(d => justFailed.has(d))) {
          skipStmt.run(now, row.id);
          failedNow.add(row.id);
        }
      }
      justFailed.clear();
      failedNow.forEach(id => justFailed.add(id));
    }
  },

  retryTask(taskId: string): void {
    const db = getDb();
    const now = Date.now();
    db.prepare(`UPDATE goal_tasks SET status = 'pending', failure_reason = NULL, updated_at = ? WHERE id = ?`).run(now, taskId);

    // Cascade-reset: un-skip transitively dependent tasks within the same goal only
    const goalRow = db.prepare('SELECT goal_id FROM goal_tasks WHERE id = ?').get(taskId) as { goal_id: string } | undefined;
    if (!goalRow) return;
    const { goal_id } = goalRow;

    const pendingStmt = db.prepare(`UPDATE goal_tasks SET status = 'pending', updated_at = ? WHERE id = ?`);
    const justReset = new Set<string>([taskId]);
    while (justReset.size > 0) {
      const resetNow = new Set<string>();
      const allSkipped = db.prepare(`SELECT id, depends_on FROM goal_tasks WHERE goal_id = ? AND status = 'skipped'`).all(goal_id) as { id: string; depends_on: string }[];
      for (const row of allSkipped) {
        const deps: string[] = JSON.parse(row.depends_on || '[]');
        if (deps.some(d => justReset.has(d))) {
          pendingStmt.run(now, row.id);
          resetNow.add(row.id);
        }
      }
      justReset.clear();
      resetNow.forEach(id => justReset.add(id));
    }
  },

  completeGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  failGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'failed', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  abandonGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'abandoned', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  getGoal(goalId: string): (Goal & { tasks: GoalTask[] }) | null {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId) as Goal | undefined;
    if (!goal) return null;
    const tasks = (db.prepare('SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY created_at ASC').all(goalId) as RawTask[]).map(parseTask);
    return { ...goal, tasks };
  },

  getFirstActiveGoal(): (Goal & { tasks: GoalTask[] }) | null {
    const db = getDb();
    const goal = db.prepare(`SELECT * FROM goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`).get() as Goal | undefined;
    if (!goal) return null;
    const tasks = (db.prepare('SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY created_at ASC').all(goal.id) as RawTask[]).map(parseTask);
    return { ...goal, tasks };
  },

  listGoals(limit = 20, offset = 0): Goal[] {
    return getDb()
      .prepare('SELECT * FROM goals ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as Goal[];
  },
};
