#!/bin/bash

if [ -n "$PLAYWRIGHT_COMMAND" ]; then
  echo "running $PLAYWRIGHT_COMMAND";
  if (npm run $PLAYWRIGHT_COMMAND -e 1); then 
    echo "Salomon E2E tests passed";
    npm run allure:gen;
  else
    echo "FAILED TESTS";
    npm run allure:gen && exit 1;
  fi
else 
  echo "PLAYWRIGHT_COMMAND is not defined manually";

  echo "Running Salomon E2E tests";
  if (npm run ci:salomon:production:chrome -e 1); then
    echo "Salomon E2E tests passed";
    npm run allure:gen
  else
    echo "FAILED TESTS";
    npm run allure:gen && exit 1;
  fi
fi
