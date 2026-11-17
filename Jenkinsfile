

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    CI = 'true'
    // Prisma generate needs a URL string present;
    // CI does not connect to a DB here.
    DATABASE_URL = 'postgresql://ci:ci@127.0.0.1:5432/ci'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

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
  }

  post {
    always {
      echo "Build finished: ${currentBuild.currentResult}"
    }
  }
}
