// Single short read-only transaction over prospect_foundry.sqlite. Never writes; never holds a lock longer than the query batch.
import { DatabaseSync } from 'node:sqlite';

export function readDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 4000; PRAGMA query_only = ON;');
    db.exec('BEGIN');
    const all = (sql) => db.prepare(sql).all();
    const one = (sql) => db.prepare(sql).get();
    const tableExists = (n) => !!one(`SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='${n}'`);
    const countOf = (n) => (tableExists(n) ? one(`SELECT COUNT(*) AS n FROM ${n}`).n : null);
    const r = {
      total: one('SELECT COUNT(*) AS n FROM businesses').n,
      classified: one('SELECT COUNT(*) AS n FROM business_classification').n,
      byState: all('SELECT qualification_state AS k, COUNT(*) AS n FROM business_classification GROUP BY 1'),
      byCampaign: all(`SELECT primary_campaign AS campaign, qualification_state AS state, contact_route AS route, COUNT(*) AS n
                       FROM business_classification GROUP BY 1,2,3`),
      duplicates: one(`SELECT COUNT(*) AS n FROM business_classification WHERE duplicate_status NOT IN ('UNIQUE_CANDIDATE','') AND duplicate_status IS NOT NULL`).n,
      suppressedClass: one(`SELECT COUNT(*) AS n FROM business_classification WHERE suppression_status='SUPPRESSED'`).n,
      suppressionRows: countOf('suppression'),
      contactChannels: all('SELECT channel, verification, COUNT(*) AS n FROM contacts GROUP BY 1,2'),
      routeQueue: all('SELECT service, status, COUNT(*) AS n FROM route_queue GROUP BY 1,2'),
      blockedReasons: all(`SELECT reason, COUNT(*) AS n FROM route_queue WHERE status='BLOCKED' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      readyMultiService: one(`SELECT COUNT(*) AS n FROM (SELECT business_id FROM route_queue WHERE status='READY' GROUP BY business_id HAVING COUNT(DISTINCT service)>1)`).n,
      readySuppressed: one(`SELECT COUNT(*) AS n FROM route_queue q JOIN business_classification c ON c.business_id=q.business_id WHERE q.status='READY' AND c.suppression_status='SUPPRESSED'`).n,
      growth: all(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM businesses GROUP BY 1 ORDER BY 1`),
      sourceJobs: all('SELECT source, status, attempts FROM source_jobs'),
      workerJobs: tableExists('worker_jobs') ? all('SELECT worker, status, COUNT(*) AS n FROM worker_jobs GROUP BY 1,2') : [],
      outreachEvents: tableExists('outreach_events') ? all('SELECT event, campaign, substr(at,1,10) AS day, COUNT(*) AS n FROM outreach_events GROUP BY 1,2,3') : null,
      outreachSends: tableExists('outreach_events') ? all(`SELECT message_id AS id, at, campaign, 'EVENT' AS source FROM outreach_events WHERE upper(event) IN ('SENT','GMAIL_ACCEPTED','SEND_CONFIRMED')`) : [],
      queueRows: countOf('outreach_queue'),
      preparedSnapshots: countOf('safety_snapshots'),
      safetyAttempts: tableExists('safety_attempts') ? all('SELECT status, COUNT(*) AS n FROM safety_attempts GROUP BY 1') : [],
      safetyControl: tableExists('safety_control') ? all('SELECT reason FROM safety_control') : [],
      verifiedContactEvidence: countOf('safety_contact_evidence'),
      historySyncedAccounts: countOf('safety_sync'),
      quarantine: one(`SELECT COUNT(*) AS n FROM audit_events WHERE event='IDENTITY_QUARANTINE'`).n,
    };
    db.exec('COMMIT');
    return r;
  } finally { try { db.close(); } catch { /* ignore */ } }
}
