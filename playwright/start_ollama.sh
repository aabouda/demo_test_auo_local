#!/bin/bash

# Script de démarrage pour Ollama (moteur de recherche d'éléments)

echo "🚀 Démarrage du serveur Ollama pour la recherche d'éléments Playwright"
echo ""

# Vérifier si Ollama est installé
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama n'est pas installé."
    echo "📥 Installation : https://ollama.com/download"
    exit 1
fi

# Vérifier si le modèle mistral est disponible
echo "🔍 Vérification du modèle 'mistral'..."
if ! ollama list | grep -q "mistral"; then
    echo "📥 Téléchargement du modèle 'mistral' (cela peut prendre quelques minutes)..."
    ollama pull mistral
    if [ $? -ne 0 ]; then
        echo "❌ Erreur lors du téléchargement du modèle"
        exit 1
    fi
    echo "✅ Modèle 'mistral' téléchargé avec succès"
else
    echo "✅ Modèle 'mistral' déjà disponible"
fi

# Vérifier si Ollama est déjà en cours d'exécution
if lsof -Pi :11434 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Ollama est déjà en cours d'exécution sur le port 11434"
    echo "✅ Le serveur est prêt à être utilisé"
else
    echo "🚀 Lancement du serveur Ollama..."
    echo "📍 URL : http://localhost:11434"
    echo "📝 Appuyez sur Ctrl+C pour arrêter le serveur"
    echo ""
    ollama serve
fi
