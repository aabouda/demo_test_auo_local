// utils/output-writer.js
import fs from 'fs';
import path from 'path';

const outputPath = path.resolve('../output.json');

export function updateOutputFile(testId, status) {
    try {
       const content = fs.readFileSync(outputPath, 'utf-8');
       let data = JSON.parse(content);
  
      const index = data.detaille_execution.findIndex(t => t.id_test_case == testId);
  
      if (index >= 0) {
        data.detaille_execution[index].status = status;
      } else {
        data.detaille_execution.push({ id_test_case: testId, status });
      }
  
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`✅ Fichier output.json mis à jour avec ${testId} → ${status}`);
    } catch (e) {
      console.error(`❌ Erreur écriture output.json : ${e.message}`);
    }
  }
