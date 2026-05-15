# Guide pour lancer le serveur de recherche d'éléments

## 🎯 Serveur utilisé : Ollama

Le système de recherche de paths d'éléments dans Playwright utilise **Ollama** comme moteur LLM pour trouver les sélecteurs d'éléments.

### 📍 Configuration

Les fichiers JavaScript appellent Ollama sur :
- **URL par défaut** : `http://localhost:11434/api/generate`
- **Modèle utilisé** : `mistral`
- **Variable d'environnement** : `OLLAMA_URL` (optionnel, pour changer l'URL)

### 🚀 Comment lancer Ollama

#### Option 1 : Ollama installé localement

```bash
# 1. Vérifier qu'Ollama est installé
ollama --version

# 2. Lancer le serveur Ollama
ollama serve

# 3. Dans un autre terminal, télécharger le modèle mistral (si pas déjà fait)
ollama pull mistral
```

#### Option 2 : Ollama avec Docker

```bash
# Lancer Ollama dans un conteneur Docker
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Télécharger le modèle mistral
docker exec -it ollama ollama pull mistral
```

#### Option 3 : Ollama avec variables d'environnement personnalisées

```bash
# Si vous voulez utiliser une URL différente
export OLLAMA_URL="http://localhost:11434/api/generate"

# Puis lancer vos tests Playwright
npm test
```

### 📝 Fichiers concernés

Les fichiers JavaScript qui utilisent Ollama :

1. **`src/steps/utils/llmAgent.js`** 
   - Appelle `http://localhost:11434/api/generate`
   - Utilise le modèle `mistral`
   - Fonction : `callLLMAgent(label, action, htmlBlocks)`

2. **`src/steps/utils/resolveSelectorFromTree.js`**
   - Appelle `http://localhost:11434/api/generate` (ou `OLLAMA_URL`)
   - Utilise le modèle `mistral`
   - Fonction : `askOllama(prompt)`

### 🔍 Vérification que le serveur fonctionne

```bash
# Test simple avec curl
curl http://localhost:11434/api/generate -d '{
  "model": "mistral",
  "prompt": "Bonjour",
  "stream": false
}'
```

### ⚙️ Configuration dans les tests Playwright

Le fichier `src/steps/utils/resolveSelectorFromTree.js` utilise :

```javascript
let url_ollama = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
```

Vous pouvez donc définir `OLLAMA_URL` dans votre environnement :

```bash
export OLLAMA_URL="http://votre-serveur:11434/api/generate"
```

### 🐛 Dépannage

#### Erreur : "Connection refused" ou "ECONNREFUSED"

**Solution** : Vérifiez qu'Ollama est bien lancé :
```bash
# Vérifier que le port 11434 est ouvert
lsof -i :11434
# ou
netstat -an | grep 11434
```

#### Erreur : "Model not found"

**Solution** : Téléchargez le modèle mistral :
```bash
ollama pull mistral
```

#### Le serveur ne répond pas

**Solution** : Redémarrez Ollama :
```bash
# Arrêter Ollama
pkill ollama

# Relancer
ollama serve
```

### 📚 Documentation Ollama

- Site officiel : https://ollama.com/
- Documentation API : https://github.com/ollama/ollama/blob/main/docs/api.md
