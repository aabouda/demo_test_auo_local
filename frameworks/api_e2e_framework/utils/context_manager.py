class ContextManager:
    """
    Stocke et gère les variables entre steps.
    Exemple : access_token, id d’un objet créé, etc.
    """

    def __init__(self):
        self.variables = {}

    def set_var(self, key, value):
        """Ajoute ou met à jour une variable"""
        self.variables[key] = value
        print(f"🔄 [Context] {key} = {value}")

    def get_var(self, key, default=None):
        """Récupère une variable si elle existe"""
        return self.variables.get(key, default)

    def has_var(self, key):
        """Vérifie si une variable existe"""
        return key in self.variables

    def reset(self):
        """Réinitialise le contexte"""
        self.variables = {}
