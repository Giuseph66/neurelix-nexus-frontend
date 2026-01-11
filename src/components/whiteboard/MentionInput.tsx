import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api";

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string | null;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  className?: string;
  projectId?: string;
}

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  projectId,
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [suggestions, setSuggestions] = useState<TeamMember[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch team members for the project
  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      return;
    }

    const fetchMembers = async () => {
      try {
        const data = await apiFetch<{ members: { id: string; user_id: string; profiles?: { full_name: string | null } }[] }>(
          `/projects/${projectId}/members`
        );

        const teamMembers: TeamMember[] = (data.members || []).map(m => ({
          id: m.id,
          user_id: m.user_id,
          full_name: m.profiles?.full_name || 'Usuário',
        }));

        setMembers(teamMembers);
      } catch (error) {
        console.error('Error fetching members:', error);
        return;
      }
    };

    fetchMembers();
  }, [projectId]);

  useEffect(() => {
    if (!mentionQuery) {
      setSuggestions([]);
      return;
    }

    const lower = mentionQuery.toLowerCase();
    const filtered = members.filter(m => m.full_name?.toLowerCase().includes(lower));
    setSuggestions(filtered);
    setSelectedIndex(0);
  }, [mentionQuery, members]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    onChange(newValue);
    
    // Find if we're typing a mention
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's no space after @ (we're still typing the mention)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionStart(lastAtIndex);
        setMentionQuery(textAfterAt);
        setShowSuggestions(true);
        return;
      }
    }
    
    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStart(-1);
  };

  const insertMention = (member: TeamMember) => {
    if (mentionStart < 0) return;
    
    const beforeMention = value.slice(0, mentionStart);
    const afterMention = value.slice(mentionStart + mentionQuery.length + 1);
    const newValue = `${beforeMention}@${member.full_name} ${afterMention}`;
    
    onChange(newValue);
    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStart(-1);
    
    // Focus back on textarea
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertMention(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
    
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        onBlur={() => {
          // Delay hiding to allow click on suggestion
          setTimeout(() => setShowSuggestions(false), 200);
        }}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg z-50">
          <ScrollArea className="max-h-40">
            <div className="p-1">
              {suggestions.map((member, index) => (
                <button
                  key={member.id}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left ${
                    index === selectedIndex ? 'bg-accent' : 'hover:bg-muted'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(member);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px]">
                      {member.full_name?.substring(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.full_name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
