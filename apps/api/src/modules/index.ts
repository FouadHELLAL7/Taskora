import type { FastifyInstance } from 'fastify';
import { settingsRoutes } from './settings/routes.js';
import { crmRoutes } from './crm/routes.js';
import { adminRoutes } from './admin/routes.js';
import { ticketRoutes } from './tickets/routes.js';

export async function registerModules(app: FastifyInstance) {
  await app.register(settingsRoutes);
  await app.register(crmRoutes);
  await app.register(adminRoutes);
  await app.register(ticketRoutes);
}
