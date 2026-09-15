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
                sh '''ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o StrictHostKeyChecking=yes \
                    inhwan@192.168.0.210 'bash -s' < deploy/deploy.sh'''
            }
        }
    }
    post { always { deleteDir() } }
}
