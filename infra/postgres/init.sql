-- Rol con el que corre la aplicación. No es dueño de las tablas ni puede saltear Row Level Security:
-- así, el aislamiento entre organizaciones lo garantiza la base de datos y no solo el código.
CREATE ROLE potrero_app LOGIN PASSWORD 'potrero_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE potrero TO potrero_app;
GRANT USAGE ON SCHEMA public TO potrero_app;
ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potrero_app;
ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO potrero_app;
-- Base de datos sombra para `prisma migrate dev`.
CREATE DATABASE potrero_shadow OWNER potrero_admin;
