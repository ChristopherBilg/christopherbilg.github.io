self.addEventListener('message', (ev) => {
  const { type, payload } = ev.data || {};
  if (type === 'scan') {
    const findings = scan(payload);
    self.postMessage({
      type: 'findings',
      findings,
      scannedAt: new Date().toISOString(),
    });
  }
});

function scan({ objects, links, changesets }) {
  const findings = [];

  const idIndex = {};
  for (const [type, info] of Object.entries(objects)) {
    idIndex[type] = new Set(info.rows.map((r) => String(r[info.pk])));
  }

  for (const [linkName, link] of Object.entries(links)) {
    if (link.direction === 'reverse') continue;
    const sourceInfo = objects[link.source];
    const targetIds = idIndex[link.target];
    if (!sourceInfo || !targetIds) continue;

    for (const row of sourceInfo.rows) {
      const fk = row[link.fk];
      if (fk == null) continue;
      if (!targetIds.has(String(fk))) {
        findings.push({
          severity: 'error',
          type: 'orphan_fk',
          message: `${link.source} ${row[sourceInfo.pk]} references missing ${link.target} "${fk}" via ${linkName}`,
          details: {
            link: linkName,
            sourceType: link.source,
            sourceId: row[sourceInfo.pk],
            targetType: link.target,
            missingId: fk,
          },
        });
      }
    }
  }

  for (const cs of changesets) {
    const ids = idIndex[cs.objectType];
    if (!ids || !ids.has(String(cs.objectId))) {
      findings.push({
        severity: 'warn',
        type: 'orphan_changeset',
        message: `ChangeSet ${cs.id} (${cs.action}) targets missing ${cs.objectType}:${cs.objectId}`,
        details: {
          changeSetId: cs.id,
          action: cs.action,
          objectType: cs.objectType,
          objectId: cs.objectId,
        },
      });
    }
  }

  for (const cs of changesets) {
    if (!cs.changes) continue;
    for (const [linkName, link] of Object.entries(links)) {
      if (link.direction === 'reverse') continue;
      if (link.source !== cs.objectType) continue;
      if (cs.changes[link.fk] === undefined) continue;

      const value = cs.changes[link.fk];
      const targetIds = idIndex[link.target];
      if (targetIds && !targetIds.has(String(value))) {
        findings.push({
          severity: 'error',
          type: 'drift_fk',
          message: `ChangeSet ${cs.id} sets ${link.source}.${link.fk} = "${value}", but no such ${link.target} exists`,
          details: {
            changeSetId: cs.id,
            link: linkName,
            fkField: link.fk,
            fkValue: value,
            targetType: link.target,
          },
        });
      }
    }
  }

  return findings;
}
