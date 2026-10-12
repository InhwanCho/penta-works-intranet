package com.pentaworks.intranet.config;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import static org.junit.jupiter.api.Assertions.assertEquals;

class MreyesConfigurationTest {
    @Test
    void integrationFilterCanReadTheKeyFromTheActualApplicationConfiguration() throws Exception {
        var environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("test", Map.of("MREYES_API_KEY", "test-only-integration-key")));
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml")))
            environment.getPropertySources().addLast(source);
        assertEquals("test-only-integration-key", environment.getProperty("app.integrations.mreyes.api-key"));
    }
}
