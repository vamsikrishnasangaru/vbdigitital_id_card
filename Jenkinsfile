
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    CI = 'true'
    DATABASE_URL = 'postgresql://ci:ci@127.0.0.1:5432/ci'
    VPS_HOST = '187.127.149.7'
    VPS_APP = '/var/www/id-app'
    KNOWN_HOSTS = 'C:\\ProgramData\\Jenkins\\.ssh\\known_hosts'
  }

  stages {

    // ==========================================
    // 1. CHECKOUT
    // ==========================================

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    // ==========================================
    // 2. VERIFY GIT COMMIT
    // ==========================================

    stage('Verify Git Commit') {
      steps {
        bat '''
          @echo on
          echo GIT_COMMIT=%GIT_COMMIT%
          git rev-parse HEAD
          if not defined GIT_COMMIT exit /b 1
        '''
      }
    }

    // ==========================================
    // 3. INSTALL DEPENDENCIES
    // ==========================================

    stage('Install') {
      steps {
        bat '''
          @echo on
          where node || exit /b 1
          node -v || exit /b 1

          call npm install -g pnpm@9 || exit /b 1

          set "PATH=%APPDATA%\\npm;%PATH%"

          where pnpm || exit /b 1
          call pnpm -v || exit /b 1

          call pnpm install --frozen-lockfile || exit /b 1

          cd packages\\db

          call pnpm exec prisma generate --schema=prisma\\schema.prisma || exit /b 1

          cd ..\\..

          powershell -NoProfile -Command "$f = Get-ChildItem -Path node_modules\\.pnpm -Recurse -Filter index.d.ts | Where-Object { $_.FullName -match '\\\\.prisma\\\\client\\\\index\\.d\\.ts$' } | Sort-Object Length -Descending | Select-Object -First 1; if (-not $f -or $f.Length -lt 100000) { Write-Error ('Prisma client not generated (size={0})' -f $(if ($f) { $f.Length } else { 0 })); exit 1 }; Write-Host ('Prisma client OK: {0} ({1} bytes)' -f $f.FullName, $f.Length); if (-not (Select-String -Path $f.FullName -Pattern 'StudentWhereInput' -Quiet)) { Write-Error 'StudentWhereInput missing from Prisma client'; exit 1 }" || exit /b 1
        '''
      }
    }

    // ==========================================
    // 4. TYPECHECK
    // ==========================================

    stage('Typecheck') {
      steps {
        bat '''
          @echo on
          set "PATH=%APPDATA%\\npm;%PATH%"

          call pnpm exec tsc --noEmit -p apps/api/tsconfig.json || exit /b 1

          call pnpm exec tsc --noEmit -p apps/web/tsconfig.json || exit /b 1
        '''
      }
    }

    // ==========================================
    // 5. UNIT TESTS
    // ==========================================

    stage('Unit tests') {
      steps {
        bat '''
          @echo on
          set "PATH=%APPDATA%\\npm;%PATH%"

          cd apps\\api

          call pnpm test -- --passWithNoTests --testPathPatterns="pricing.calculator|b2b-order-status|wallet-ledger" || exit /b 1
        '''
      }
    }

    // ==========================================
    // 6. BUILD WEB
    // ==========================================

    stage('Build web') {
      steps {
        bat '''
          @echo on
          set "PATH=%APPDATA%\\npm;%PATH%"

          cd apps\\web

          call pnpm run build || exit /b 1
        '''
      }
    }

    // ==========================================
    // 7. VPS SSH PREFLIGHT
    // ==========================================

    stage('VPS SSH Preflight') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "echo VPS_CONNECTION_SUCCESS; hostname; whoami; cd %VPS_APP% && git rev-parse --short HEAD && pm2 status"

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }

    // ==========================================
    // 8. PREPARE DEPLOYMENT
    // ==========================================

    stage('Prepare Deployment') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            if not defined GIT_COMMIT exit /b 1

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "cd %VPS_APP% && git fetch origin %GIT_COMMIT% && git checkout --detach %GIT_COMMIT% && git diff --quiet && git diff --cached --quiet && test \\"$(git rev-parse HEAD)\\" = \\"%GIT_COMMIT%\\""

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }

    // ==========================================
    // 9. DATABASE BACKUP
    // ==========================================

    stage('Database Backup') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "set -e; BACKUP=/root/id-app-backup-$(date +%%Y%%m%%d-%%H%%M%%S).sql; docker exec id_card_builder_db pg_dump -U postgres -d id_card_builder > $BACKUP; test -s $BACKUP; ls -lh $BACKUP"

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }

    // ==========================================
    // 10. DEPLOY API
    // ==========================================

    stage('Deploy API') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "cd %VPS_APP% && export DEPLOY_COMMIT=%GIT_COMMIT% && bash scripts/vps-deploy-api.sh && curl -fsS http://127.0.0.1:4000/api/docs >/dev/null && echo API_DEPLOYMENT_SUCCESS"

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }

    // ==========================================
    // 11. DEPLOY WEB
    // ==========================================

    stage('Deploy Web') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "cd %VPS_APP% && export DEPLOY_COMMIT=%GIT_COMMIT% && bash scripts/vps-deploy-web.sh && curl -fsS http://127.0.0.1:3000/ >/dev/null && echo WEB_DEPLOYMENT_SUCCESS"

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }

    // ==========================================
    // 12. PRODUCTION HEALTH CHECK
    // ==========================================

    stage('Production Health Check') {
      steps {
        withCredentials([
          sshUserPrivateKey(
            credentialsId: 'vps-ssh',
            keyFileVariable: 'SSH_KEY',
            usernameVariable: 'SSH_USER'
          )
        ]) {
          bat '''
            @echo on

            ssh -i "%SSH_KEY%" ^
              -o BatchMode=yes ^
              -o StrictHostKeyChecking=yes ^
              -o UserKnownHostsFile="%KNOWN_HOSTS%" ^
              %SSH_USER%@%VPS_HOST% ^
              "set -e; curl -fsS http://127.0.0.1:3000/ >/dev/null; curl -fsS http://127.0.0.1:4000/api/docs >/dev/null; curl -fsS https://id.vbdigital.tech/ >/dev/null; pm2 status; echo PRODUCTION_DEPLOYMENT_SUCCESS"

            if errorlevel 1 exit /b 1
          '''
        }
      }
    }
  }

  // ==========================================
  // POST BUILD
  // ==========================================

  post {
    success {
      echo 'CI/CD pipeline completed successfully.'
      echo 'Production deployment verified.'
    }

    failure {
      echo 'CI/CD pipeline failed. Check the failed stage and VPS logs.'
    }

    always {
      echo "Build finished: ${currentBuild.currentResult}"
    }
  }
}
