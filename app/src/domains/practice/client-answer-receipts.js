// SQL for the client answer receipts: the response of each answer sent with a client_answer_id, so a repeated post
// gets the first response back. No business rules; the practice service writes a receipt in the same transaction as
// the answer.
export function createClientAnswerReceiptRepository({ database }) {
  const selectReceiptStatement = database.prepare(`
    SELECT client_answer_receipts.kind, client_answer_receipts.response
    FROM client_answer_receipts
    WHERE client_answer_receipts.client_answer_id = @clientAnswerId
  `);
  const insertReceiptStatement = database.prepare(`
    INSERT INTO client_answer_receipts (client_answer_id, kind, response, created_at)
    VALUES (@clientAnswerId, @kind, @response, @createdAt)
  `);
  const deleteReceiptsCreatedBeforeStatement = database.prepare(`
    DELETE FROM client_answer_receipts
    WHERE client_answer_receipts.created_at < @createdBefore
  `);

  // { kind, response (JSON text) } of the answer, or null when it was not received before.
  function findReceipt(clientAnswerId) {
    return selectReceiptStatement.get({ clientAnswerId }) ?? null;
  }

  // kind: 'grade' or 'drill'. response: the value returned to the phone, stored as JSON text.
  function createReceipt({ clientAnswerId, kind, response, createdAt }) {
    insertReceiptStatement.run({ clientAnswerId, kind, response: JSON.stringify(response), createdAt });
  }

  // Receipts created before the timestamp (ms) are deleted; returns nothing.
  function deleteReceiptsCreatedBefore(timestamp) {
    deleteReceiptsCreatedBeforeStatement.run({ createdBefore: timestamp });
  }

  return Object.freeze({ findReceipt, createReceipt, deleteReceiptsCreatedBefore });
}
