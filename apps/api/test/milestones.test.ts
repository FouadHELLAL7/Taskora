import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let admin: Client & { userId: number };

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

describe('cross-project milestones', () => {
  it('lists milestones with project, company and task counts', async () => {
    const co = await makeCompany(admin, 'Milestone Co');
    const { body: p } = await admin.post('/api/v1/projects', { name: 'Office move', companyId: co.id, status: 'active' });
    const { body: other } = await admin.post('/api/v1/projects', { name: 'Firewall upgrade', companyId: co.id });
    const past = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    const { body: m1 } = await admin.post(`/api/v1/projects/${p.id}/milestones`, { name: 'Cabling done', dueDate: past });
    const { body: m2 } = await admin.post(`/api/v1/projects/${p.id}/milestones`, { name: 'Go live', dueDate: future });
    const m3 = await admin.post(`/api/v1/projects/${other.id}/milestones`, { name: 'Kick-off', dueDate: past, isComplete: true });
    expect(m3.status).toBe(201);
    await admin.post(`/api/v1/projects/${p.id}/tasks`, { title: 'Pull cables', milestoneId: m1.id, status: 'done' });
    await admin.post(`/api/v1/projects/${p.id}/tasks`, { title: 'Patch panel', milestoneId: m1.id });
    await admin.post(`/api/v1/projects/${p.id}/tasks`, { title: 'Unassigned', status: 'done' });

    const open = await admin.get('/api/v1/project-milestones');
    expect(open.status).toBe(200);
    expect(open.body.total).toBe(2);
    // Default ordering: due date ascending (overdue first).
    expect(open.body.data.map((m: { name: string }) => m.name)).toEqual(['Cabling done', 'Go live']);
    const cabling = open.body.data[0];
    expect(cabling).toMatchObject({ projectId: p.id, projectName: 'Office move', projectNumber: p.projectNumber, companyName: 'Milestone Co', taskCount: 2, doneTaskCount: 1, isComplete: false });
    expect(open.body.data[1]).toMatchObject({ id: m2.id, taskCount: 0, doneTaskCount: 0 });

    const complete = await admin.get('/api/v1/project-milestones?status=complete');
    expect(complete.body.data.map((m: { name: string }) => m.name)).toEqual(['Kick-off']);

    const all = await admin.get('/api/v1/project-milestones?status=all');
    expect(all.body.total).toBe(3);

    const byProject = await admin.get(`/api/v1/project-milestones?status=all&projectId=${other.id}`);
    expect(byProject.body.total).toBe(1);

    const search = await admin.get('/api/v1/project-milestones?q=go%20live');
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].id).toBe(m2.id);

    const overdue = await admin.get('/api/v1/project-milestones?overdue=true');
    expect(overdue.body.data.map((m: { id: number }) => m.id)).toEqual([m1.id]);
  });

  it('requires projects.read', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/project-milestones' });
    expect(res.statusCode).toBe(401);
  });
});
