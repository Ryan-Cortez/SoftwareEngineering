# Database Setup (MySQL via Docker)

## Prereqs
1. Install Docker Desktop
  - Windows: https://docs.docker.com/desktop/setup/install/windows-install/
  - Mac: https://docs.docker.com/desktop/setup/install/mac-install/
2. Run Docker Desktop

## Start the database (all commands should be from the repo root)
3. Command: docker compose up -d
4. Command: docker ps
  - You should see something like this:
     - 023eb799d4fc   mysql:8.0   "docker-entrypoint.s…"   48 minutes ago   Up 48 minutes (healthy)   0.0.0.0:3306->3306/tcp, [::]:3306->3306/tcp   cinema-mysql
5. If you see this container running with port 3306 exposed, the MySQL database is running and ready

# Additional Info

## If I change the database (I will notify everyone when that happens) (commands should be from the repo root):
1. Command: docker compose down -v
2. Command: docker compose up -d
3. Now everything should be updated

## (Optional) To stop the database (commands should be from the repo root):
- Command: docker compose down

## (Optional) To test the connection manually (commands should be from the repo root):
1. Command: docker exec -it cinema-mysql mysql -u cinema_user -pcinema_password cinema
2. mysql> SHOW TABLES;
- You should see some tables such as hall, movie, show, etc.
3. mysql> SELECT * FROM movie;
- You should see all the movies in the database.
4. mysql> EXIT;

# For the backend specifically

## How to connect to the database

- Host: localhost
- Port: 3306
- Database: cinema
- Username: cinema_user
- Password: cinema_password
- Root password: abc123

## The updated database schema

- check database_design.md