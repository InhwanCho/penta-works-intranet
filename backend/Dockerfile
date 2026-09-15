FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /workspace
COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./
RUN ./gradlew dependencies --no-daemon
COPY src src
RUN ./gradlew test bootJar --no-daemon

FROM eclipse-temurin:17-jre-jammy
RUN groupadd --system app && useradd --system --gid app --home /app app
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
RUN mkdir -p /data/uploads && chown -R app:app /app /data/uploads
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
