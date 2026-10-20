import type { FastifyInstance } from 'fastify';
import { settingsRoutes } from './settings/routes.js';
import { crmRoutes } from './crm/routes.js';
import { adminRoutes } from './admin/routes.js';
import { ticketRoutes } from './tickets/routes.js';
import { cmdbRoutes } from './cmdb/routes.js';
import { timeRoutes } from './time/routes.js';
import { contractRoutes } from './contracts/routes.js';
import { projectRoutes } from './projects/routes.js';
import { kbRoutes } from './kb/routes.js';
import { billingRoutes } from './billing/routes.js';
import { attachmentRoutes } from './attachments/routes.js';
import { notificationRoutes } from './notifications/routes.js';
import { searchRoutes } from './search/routes.js';
import { schedulingRoutes } from './scheduling/routes.js';
import { automationRoutes } from './automation/routes.js';
import { reportRoutes } from './reports/routes.js';
import { integrationRoutes } from './integrations/routes.js';

export async function registerModules(app: FastifyInstance) {
  await app.register(settingsRoutes);
  await app.register(crmRoutes);
  await app.register(adminRoutes);
  await app.register(ticketRoutes);
  await app.register(cmdbRoutes);
  await app.register(timeRoutes);
  await app.register(contractRoutes);
  await app.register(projectRoutes);
  await app.register(kbRoutes);
  await app.register(billingRoutes);
  await app.register(attachmentRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(schedulingRoutes);
  await app.register(automationRoutes);
  await app.register(reportRoutes);
  await app.register(integrationRoutes);
}
