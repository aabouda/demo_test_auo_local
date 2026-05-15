export const dbConfig = {
    user: 'postgres',
    host: 'database-1-instance-1.c9ekigiekyeq.eu-west-3.rds.amazonaws.com',
    database: 'myrealm',
    password: 'Tunage19809*',
    port: 5432,  
    ssl: {
        rejectUnauthorized: false, // ⚠️ ça désactive la vérification du certificat
    }
};