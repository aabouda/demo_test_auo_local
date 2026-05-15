// analyzer.js
import fs from 'fs';

export async function logDecision({ label, action, method, selector, score }) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    label,
    action,
    method,
    selector,
    score
  };

  fs.appendFile('decisions.log', JSON.stringify(logEntry) + '\n', err => {
    if (err) console.error('Erreur lors de l\'enregistrement de la décision:', err);
  });
}
