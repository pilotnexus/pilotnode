compile:
	tsc

deploy: guard-PILOT_DEVENV_PI_HOST compile
	sshpass -p raspberry rsync -av --exclude 'node_modules*' . pi@$(PILOT_DEVENV_PI_HOST):~/pilotnode

update: deploy
	sshpass -p raspberry ssh -t pi@$(PILOT_DEVENV_PI_HOST) "cd ~/pilotnode; npm install"

executable: compile
	pkg --targets armv7 bin/app.js
	mv  app-linux exec/pilotnode-linux
	mv ./app-macos exec/pilotnode-macos
	mv ./app-win.exe exec/pilotnode-win.exe
	cp node_modules/os-service/build/Release/service.node exec/


guard-%:
	@if [ "${${*}}" = "" ]; then \
		echo "Environment variable $* not set"; \
		exit 1; \
	fi
