const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

(async () => {
  const q = await p.query(`
    SELECT c.cluster_type, reason, COUNT(*) AS n
    FROM catalyst_clusters c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(c.structured_attributes #> '{researchReport,qualificationReasons}', '[]'::jsonb)
    ) AS reason
    GROUP BY c.cluster_type, reason
    ORDER BY n DESC
  `);
  console.log('=== rejection reasons (grouped) ===');
  console.table(q.rows);

  // Also: thesisStatus distribution among rejected
  const t = await p.query(`
    SELECT c.structured_attributes #>> '{researchReport,thesisStatus}' AS thesis,
           c.structured_attributes #>> '{researchReport,direction}' AS direction,
           COUNT(*) AS n
    FROM catalyst_clusters c
    WHERE c.materiality_json IS NOT NULL
    GROUP BY 1, 2 ORDER BY n DESC
  `);
  console.log('=== thesisStatus x direction ===');
  console.table(t.rows);

  await p.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
