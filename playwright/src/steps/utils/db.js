// src/utils/db.js
import pkg from 'pg';
import { dbConfig } from './config-db.js';
const { Client } = pkg;

export async function updateTestStatus(testId, status, execution_id) {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    await client.query(
      'UPDATE details_execution_ui SET resultat = $1, date_execution = NOW() WHERE scenario_id = $2 and execution_id = $3',
      [status, testId, execution_id]
    );
    console.log(`✅ BDD → execution_id ${execution_id} et test ${testId} mis à jour avec status = ${status}`);
  } catch (err) {
    console.error(`❌ Erreur update BDD test ${testId} : ${err.message}`);
  } finally {
    await client.end();
  }
}

export async function updateStepDom(stepId, dom) {
    const client = new Client(dbConfig);
    try {
      await client.connect();
      await client.query(
        'UPDATE steps SET dom = $1 WHERE id = $2',
        [dom, stepId]
      );
      console.log(`✅ BDD → step ${stepId} mis à jour avec dom = ${dom}`);
    } catch (err) {
      console.error(`❌ Erreur update BDD test ${stepId} : ${err.message}`);
    } finally {
      await client.end();
    }
  }



export async function insertScreenshotRecord(execution_id, step_index, fileName, status = 'pending', label = null) {
  const client = new Client(dbConfig);
  try {
    await client.connect();

    const filePath = `/static/screenshots/${fileName}`;

    await client.query(
      `INSERT INTO screenshots_ui (
         scenario_id,
         execution_id,
         step_index,
         file_name,
         file_path,
         status,
         label,
         created_at
       )
       VALUES ($1, $2, 1 , $3, $4, $5, $6,  NOW())`,
      [execution_id, execution_id, fileName, filePath, status, label]
    );

    console.log(`✅ Screenshot enregistré pour test ${step_index}, step ${step_index}, status=${status}`);
  } catch (err) {
    console.error(`❌ Erreur insert screenshot DB : ${err.message}`);
  } finally {
    await client.end();
  }
}