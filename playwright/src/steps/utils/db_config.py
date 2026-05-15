import psycopg2

def get_connection():
    return psycopg2.connect(
        host="database-1-instance-1.c9ekigiekyeq.eu-west-3.rds.amazonaws.com",
        port=5432,
        dbname="myrealm",
        user="postgres",
        password="Tunage19809*"
    )
