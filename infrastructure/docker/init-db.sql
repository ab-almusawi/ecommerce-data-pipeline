-- Initialize databases for Pimcore and MedusaJS

-- Create Pimcore database and user
CREATE USER pimcore WITH PASSWORD 'pimcore';
CREATE DATABASE pimcore OWNER pimcore;
GRANT ALL PRIVILEGES ON DATABASE pimcore TO pimcore;

-- Create MedusaJS database and user
CREATE USER medusa WITH PASSWORD 'medusa';
CREATE DATABASE medusa OWNER medusa;
GRANT ALL PRIVILEGES ON DATABASE medusa TO medusa;

-- Grant schema permissions
\c pimcore
GRANT ALL ON SCHEMA public TO pimcore;

\c medusa
GRANT ALL ON SCHEMA public TO medusa;
