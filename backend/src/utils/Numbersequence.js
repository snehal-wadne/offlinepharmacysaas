/**
 * Number Sequence Utility
 *
 * Generates human-readable, gap-free sequential business numbers
 * (e.g. BR-1001, EMP-1001) using the existing `number_sequences`
 * table — no schema change required.
 *
 * IMPORTANT: must be called with a PostgreSQL client that is inside
 * an open transaction (BEGIN ... COMMIT) so the SELECT ... FOR UPDATE
 * actually protects against two concurrent requests generating the
 * same number.
 */

const getNextSequenceNumber = async (client, organisationId, sequenceType) => {
  const selectQuery = `
    SELECT id, next_number
    FROM number_sequences
    WHERE organisation_id = $1
      AND sequence_type = $2
      AND branch_id IS NULL
    FOR UPDATE;
  `;

  const selectResult = await client.query(selectQuery, [organisationId, sequenceType]);

  if (selectResult.rows.length === 0) {
    // First number ever requested for this org + sequence type.
    const insertQuery = `
      INSERT INTO number_sequences (organisation_id, sequence_type, next_number)
      VALUES ($1, $2, 1002)
      RETURNING next_number;
    `;
    await client.query(insertQuery, [organisationId, sequenceType]);
    return 1001;
  }

  const { id, next_number: nextNumber } = selectResult.rows[0];

  await client.query(
    `UPDATE number_sequences
     SET next_number = next_number + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1;`,
    [id],
  );

  return nextNumber;
};

module.exports = { getNextSequenceNumber };