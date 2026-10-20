import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { can } from '../../lib/context.js';
import { likeTerm } from '../../lib/query.js';

type Hit = {
  type: string;
  id: number;
  title: string;
  subtitle: string | null;
  url: string;
};

/** Global search across the main record types the user may read. */
export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', async (req) => {
    const raw = String((req.query as { q?: string }).q ?? '').trim();
    if (raw.length < 2) return { data: [] };
    const term = likeTerm(raw.slice(0, 100));
    const exact = raw.toUpperCase();
    const queries: Promise<Hit[]>[] = [];
    const run = (q: ReturnType<typeof sql>) => app.db.execute<Hit>(q).then((r) => r.rows);

    if (can(req, 'tickets.read')) {
      queries.push(
        run(sql`select 'ticket' as type, t.id, t.ticket_number || ' · ' || t.title as title, c.name || ' · ' || st.name as subtitle, '/tickets/' || t.id as url
          from tickets t join companies c on c.id = t.company_id join ticket_statuses st on st.id = t.status_id
          where upper(t.ticket_number) = ${exact} or t.ticket_number ilike ${term} or t.title ilike ${term}
          order by (upper(t.ticket_number) = ${exact}) desc, (st.category in ('resolved','closed')) asc, t.created_at desc limit 8`),
      );
    }
    if (can(req, 'companies.read')) {
      queries.push(
        run(sql`select 'company' as type, id, name as title, coalesce(city, phone) as subtitle, '/companies/' || id as url
          from companies where name ilike ${term} or account_number ilike ${term} order by is_active desc, name limit 6`),
        run(sql`select 'contact' as type, ct.id, ct.first_name || ' ' || ct.last_name as title, c.name || coalesce(' · ' || ct.email, '') as subtitle, '/contacts/' || ct.id as url
          from contacts ct join companies c on c.id = ct.company_id
          where ct.first_name || ' ' || ct.last_name ilike ${term} or ct.email ilike ${term} or ct.phone ilike ${term} or ct.mobile ilike ${term}
          order by ct.is_active desc, ct.last_name limit 6`),
      );
    }
    if (can(req, 'cis.read')) {
      queries.push(
        run(sql`select 'ci' as type, ci.id, ci.name as title, ci.ci_number || ' · ' || c.name || coalesce(' · ' || ci.serial_number, '') as subtitle, '/assets/' || ci.id as url
          from configuration_items ci join companies c on c.id = ci.company_id
          where ci.name ilike ${term} or ci.serial_number ilike ${term} or ci.hostname ilike ${term} or ci.ci_number ilike ${term} or ci.ip_address ilike ${term} or ci.asset_tag ilike ${term}
          order by ci.name limit 6`),
      );
    }
    if (can(req, 'kb.read')) {
      queries.push(
        run(sql`select 'article' as type, id, title, article_number as subtitle, '/kb/' || id as url
          from kb_articles where title ilike ${term} or article_number ilike ${term} or ${raw} = any(tags) order by updated_at desc limit 5`),
      );
    }
    if (can(req, 'contracts.read')) {
      queries.push(
        run(sql`select 'contract' as type, k.id, k.name as title, k.contract_number || ' · ' || c.name as subtitle, '/contracts/' || k.id as url
          from contracts k join companies c on c.id = k.company_id where k.name ilike ${term} or k.contract_number ilike ${term} limit 4`),
      );
    }
    if (can(req, 'projects.read')) {
      queries.push(
        run(sql`select 'project' as type, p.id, p.name as title, p.project_number || ' · ' || c.name as subtitle, '/projects/' || p.id as url
          from projects p join companies c on c.id = p.company_id where p.name ilike ${term} or p.project_number ilike ${term} limit 4`),
      );
    }
    const results = (await Promise.all(queries)).flat();
    return { data: results };
  });
}
