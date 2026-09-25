pipeline {
    agent any
    options {
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }
    triggers { githubPush(); pollSCM('H/5 * * * *') }
    stages {
        stage('Checkout main') {
            steps {
                checkout([$class: 'GitSCM', branches: [[name: '*/main']],
                    userRemoteConfigs: [[url: 'https://github.com/InhwanCho/penta-works-intranet.git']]])
            }
        }
        stage('Verify and deploy') {
            steps {
                withCredentials([string(credentialsId: 'mreyes-office-api-key', variable: 'PENTA_OFFICE_API_KEY')]) {
                    sh '''
                        set +x
                        printf '%s\\n' "$PENTA_OFFICE_API_KEY" | \
                          ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o StrictHostKeyChecking=yes \
                          inhwan@192.168.0.210 '
                            set -eu
                            IFS= read -r secret
                            env_file=/home/inhwan/pentaworks-secrets/intranet.env
                            key_name=MREYES_API_KEY
                            test -n "$secret"
                            temp_file=$(mktemp)
                            sed "/^${key_name}=/d" "$env_file" > "$temp_file"
                            printf "%s=%s\\n" "$key_name" "$secret" >> "$temp_file"
                            install -m 600 "$temp_file" "$env_file"
                            rm -f "$temp_file"
                          '
                        ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o StrictHostKeyChecking=yes \
                          inhwan@192.168.0.210 'bash -s' < deploy/deploy.sh
                    '''
                }
            }
        }
    }
    post { always { deleteDir() } }
}
