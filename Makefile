.PHONY: help db

help:
	@echo "Targets:"
	@echo "  db    Open a MySQL shell in the cinema container"

db:
	docker exec -it cinema-mysql mysql -u cinema_user -pcinema_password cinema
