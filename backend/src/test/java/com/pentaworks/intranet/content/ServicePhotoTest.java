package com.pentaworks.intranet.content;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ServicePhotoTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ServiceWorkflowController controller = new ServiceWorkflowController(jdbc);
    private final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("qa", "");

    @BeforeEach void setup() {
        when(jdbc.queryForObject(contains("JOIN users"), eq(Integer.class), eq("qa"), eq(1L))).thenReturn(1);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM service_photos WHERE repair_id=?", Integer.class, 1L)).thenReturn(0);
        when(jdbc.update(any(PreparedStatementCreator.class), any(KeyHolder.class))).thenAnswer(call -> {
            ((KeyHolder) call.getArgument(1)).getKeyList().add(Map.of("id", 20L));
            return 1;
        });
    }

    private MockMultipartFile png(int width, int height) throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output);
        return new MockMultipartFile("file", "qa.png", "image/png", output.toByteArray());
    }

    @Test void resizesLandscapeAndThumbnail() throws Exception {
        var result = controller.uploadPhoto(1L, png(2400, 1200), auth);
        assertEquals(1920, result.get("widthPx"));
        assertEquals(960, result.get("heightPx"));
        assertEquals(480, result.get("thumbnailWidthPx"));
        assertEquals(240, result.get("thumbnailHeightPx"));
    }

    @Test void doesNotEnlargeSmallImages() throws Exception {
        var result = controller.uploadPhoto(1L, png(80, 160), auth);
        assertEquals(80, result.get("widthPx"));
        assertEquals(160, result.get("thumbnailHeightPx"));
    }

    @Test void rejectsInvalidImageBytes() {
        assertThrows(IllegalArgumentException.class, () -> controller.uploadPhoto(1L,
            new MockMultipartFile("file", "fake.jpg", "image/jpeg", new byte[]{1, 2, 3}), auth));
        verify(jdbc, never()).update(any(PreparedStatementCreator.class), any(KeyHolder.class));
    }

    @Test void rejectsTwentyFirstPhoto() throws Exception {
        when(jdbc.queryForObject("SELECT COUNT(*) FROM service_photos WHERE repair_id=?", Integer.class, 1L)).thenReturn(20);
        var file = png(1, 1);
        assertThrows(IllegalArgumentException.class, () -> controller.uploadPhoto(1L, file, auth));
    }

    @Test void rejectsNonOwner() throws Exception {
        when(jdbc.queryForObject(contains("JOIN users"), eq(Integer.class), eq("qa"), eq(1L))).thenReturn(0);
        var file = png(1, 1);
        assertThrows(AccessDeniedException.class, () -> controller.uploadPhoto(1L, file, auth));
    }
}
