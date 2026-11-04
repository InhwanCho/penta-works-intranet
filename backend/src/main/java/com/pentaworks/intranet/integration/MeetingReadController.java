package com.pentaworks.intranet.integration;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/meetings")
public class MeetingReadController {
    private final MreyesMeetings meetings;
    public MeetingReadController(MreyesMeetings meetings) { this.meetings=meetings; }
    @GetMapping public List<Map<String,Object>> list() { return meetings.list(); }
    @GetMapping("/{id}") public Map<String,Object> get(@PathVariable long id) { return meetings.get(id); }
}
