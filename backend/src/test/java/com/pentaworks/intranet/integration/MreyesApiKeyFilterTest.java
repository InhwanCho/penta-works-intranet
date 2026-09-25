package com.pentaworks.intranet.integration;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class MreyesApiKeyFilterTest {
    @Test
    void acceptsConfiguredKeyAndCreatesServiceAuthentication() throws Exception {
        var filter = new MreyesApiKeyFilter("test-service-key");
        var request = request();
        request.addHeader(MreyesApiKeyFilter.HEADER_NAME, "test-service-key");
        var response = new MockHttpServletResponse();
        var seen = new AtomicReference<Authentication>();

        filter.doFilter(request, response, (req, res) -> seen.set(SecurityContextHolder.getContext().getAuthentication()));

        assertNotNull(seen.get());
        assertEquals("mreyes-integration", seen.get().getName());
        assertEquals(200, response.getStatus());
    }

    @Test
    void rejectsWrongKey() throws Exception {
        var filter = new MreyesApiKeyFilter("test-service-key");
        var request = request();
        request.addHeader(MreyesApiKeyFilter.HEADER_NAME, "wrong-key");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertEquals(401, response.getStatus());
    }

    @Test
    void failsClosedWhenKeyIsNotConfigured() throws Exception {
        var filter = new MreyesApiKeyFilter("");
        var response = new MockHttpServletResponse();

        filter.doFilter(request(), response, (req, res) -> {});

        assertEquals(503, response.getStatus());
    }

    private MockHttpServletRequest request() {
        return new MockHttpServletRequest("GET", "/api/v1/integrations/mreyes/sites/006");
    }
}
