# SoftwareEngineering
Software Engineering Cinema E-Booking System Term Project

## Requisite Installations:
1. Docker Desktop - https://www.docker.com/products/docker-desktop/
2. flask - $ py -m pip install flask
3. flask alchemy - $ py -m pip install flask-sqlalchemy
4. flask cors - $ py -m pip install flask-cors
5. python dotenv - $ py -m pip install python-dotenv
6. mysql connector - $ py -m pip install mysql-connector-python

## How to run:

1. make sure Docker Desktop is running
3. from the project root: $ docker compose up -d
4. $ cd backend
5. for Mac:
     $ export FLASK_APP=app.y
     $ flask run
   for Windows:
     $ py -m flask --app app run --debug --port 5000
6. open a new terminal
7. $ cd frontend
8. $ npm run dev
9. open the displayed link (http://localhost:5173/)