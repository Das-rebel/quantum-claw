/**
 * FillY — Resume Parser
 * 
 * Parses plain-text resumes into FillY profile format (JSON Resume schema).
 * Also handles LinkedIn profile pages via DOM extraction.
 * 
 * Input formats supported:
 * - Plain text resume (bullet-point format)
 * - LinkedIn profile DOM (linkedin.com/in/{username})
 * - JSON Resume format
 * - LinkedIn URL → profile data
 */

(function() {
  'use strict';

  // ============================================================================
  // SECTION 1: JSON Resume Schema (standard open format)
  // ============================================================================

  const RESUME_SCHEMA = {
    basics: {
      name: '',           // Full name
      label: '',           // Professional title/label
      email: '',
      phone: '',
      url: '',             // Personal website
      summary: '',         // Professional summary
      location: {
        city: '',
        region: '',        // State/province
        countryCode: '',    // ISO-3166-1 alpha-2
      },
      profiles: [          // Social profiles
        { network: '', username: '', url: '' }
      ]
    },
    work: [{
      company: '',
      position: '',
      startDate: '',       // YYYY-MM-DD or YYYY-MM
      endDate: '',
      current: false,
      url: '',
      summary: '',
      highlights: ['']     // Bullet points
    }],
    education: [{
      institution: '',
      url: '',
      area: '',             // Field of study
      studyType: '',       // Degree type
      startDate: '',
      endDate: '',
      score: '',
      courses: ['']
    }],
    awards: [{
      title: '',
      date: '',
      issuer: '',
      summary: ''
    }],
    certificates: [{
      name: '',
      date: '',
      issuer: '',
      url: ''
    }],
    skills: [{
      name: '',
      level: '',           // e.g. "Expert", "Advanced"
      keywords: ['']       // Individual skills
    }],
    languages: [{
      language: '',        // e.g. "English"
      fluency: ''          // e.g. "Native", "Fluent"
    }],
    projects: [{
      name: '',
      description: '',
      highlights: [''],
      keywords: [''],
      startDate: '',
      endDate: '',
      url: '',
      roles: [''],
      entity: ''
    }],
    references: [{
      name: '',
      reference: ''
    }],
    meta: {
      canonical: '',
      version: '',
      lastModified: ''
    }
  };

  // ============================================================================
  // SECTION 2: Plain Text Resume Parser
  // ============================================================================

  /**
   * Parse a plain-text resume into FillY profile format.
   * Handles common resume formats with section headers and bullet points.
   */
  function parseTextResume(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const profile = JSON.parse(JSON.stringify(RESUME_SCHEMA)); // Deep clone
    
    let currentSection = 'basics';
    let currentWork = null;
    let currentEducation = null;
    let currentSkill = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();
      
      // Section detection
      if (/^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE)[:\s]/.test(upper) || 
          /^\*{3,}|—{3,}|___+$/.test(line)) {
        currentSection = 'work';
        continue;
      }
      if (/^(EDUCATION|ACADEMIC|QUALIFICATION)[:\s]/.test(upper)) {
        currentSection = 'education';
        continue;
      }
      if (/^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES)[:\s]/.test(upper)) {
        currentSection = 'skills';
        continue;
      }
      if (/^(PROJECTS|PERSONAL PROJECTS)[:\s]/.test(upper)) {
        currentSection = 'projects';
        continue;
      }
      if (/^(CERTIFICATIONS|CERTIFICATES|AWARDS|ACHIEVEMENTS)[:\s]/.test(upper)) {
        currentSection = 'awards';
        continue;
      }
      if (/^(LANGUAGES|LANGUAGE)[:\s]/.test(upper)) {
        currentSection = 'languages';
        continue;
      }
      if (/^(SUMMARY|PROFILE|OBJECTIVE|PROFESSIONAL SUMMARY)[:\s]/.test(upper)) {
        currentSection = 'basics';
        // Collect summary text
        const summaryLines = [];
        for (let j = i + 1; j < lines.length; j++) {
          const sl = lines[j];
          if (/^(EXPERIENCE|EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|LANGUAGES)[:\s]/.test(sl.toUpperCase())) { i = j - 1; break; }
          summaryLines.push(sl);
        }
        profile.basics.summary = summaryLines.join(' ').replace(/[•\-\*]\s*/g, ' ').trim();
        continue;
      }
      
      // Parse section content
      if (currentSection === 'basics') {
        parseBasicsLine(line, profile);
      } else if (currentSection === 'work') {
        const workEntry = parseWorkLine(line, lines, i);
        if (workEntry) {
          if (workEntry._consumed) {
            i = workEntry._consumed;
            delete workEntry._consumed;
          }
          if (workEntry._new) {
            if (currentWork) profile.work.push(currentWork);
            currentWork = workEntry;
            delete currentWork._new;
          }
        } else if (currentWork) {
          // Bullet point under current work
          const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
          if (bullet) currentWork.highlights.push(bullet);
        }
      } else if (currentSection === 'education') {
        const eduEntry = parseEducationLine(line, lines, i);
        if (eduEntry) {
          if (eduEntry._consumed) { i = eduEntry._consumed; delete eduEntry._consumed; }
          if (eduEntry._new) {
            if (currentEducation) profile.education.push(currentEducation);
            currentEducation = eduEntry;
            delete currentEducation._new;
          }
        }
      } else if (currentSection === 'skills') {
        const skillEntry = parseSkillLine(line);
        if (skillEntry) {
          if (currentSkill) profile.skills.push(currentSkill);
          currentSkill = skillEntry;
        } else if (currentSkill) {
          // Comma-separated skills
          const skills = line.split(',').map(s => s.trim()).filter(Boolean);
          currentSkill.keywords.push(...skills);
        }
      }
    }
    
    // Flush remaining
    if (currentWork) profile.work.push(currentWork);
    if (currentEducation) profile.education.push(currentEducation);
    if (currentSkill) profile.skills.push(currentSkill);
    
    return profile;
  }
  
  function parseBasicsLine(line, profile) {
    // Name detection (usually first non-empty line or formatted line)
    if (!profile.basics.name && /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(line)) {
      profile.basics.name = line.replace(/[^\w\s'-]/g, '').trim();
      return;
    }
    
    // Email
    const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/);
    if (emailMatch && !profile.basics.email) {
      profile.basics.email = emailMatch[0].toLowerCase();
      return;
    }
    
    // Phone
    const phoneMatch = line.match(/[\+]?[\d\s\-\(\)]{10,}/);
    if (phoneMatch && !profile.basics.phone) {
      profile.basics.phone = phoneMatch[0].replace(/\s+/g, ' ').trim();
      return;
    }
    
    // LinkedIn
    const linkedinMatch = line.match(/linkedin\.com\/in\/[\w-]+/i);
    if (linkedinMatch) {
      profile.basics.profiles.push({
        network: 'LinkedIn',
        url: 'https://' + linkedinMatch[0]
      });
      return;
    }
    
    // URL
    const urlMatch = line.match(/https?:\/\/[^\s]+/);
    if (urlMatch && !profile.basics.url) {
      profile.basics.url = urlMatch[0];
      return;
    }
  }
  
  function parseWorkLine(line, allLines, idx) {
    const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
    
    // Skip empty bullets
    if (!bullet) return null;
    
    // New work entry detection (has company + date pattern)
    // Format: "Company Name | Role | Start - End" or "Company Name, Role"
    const datePattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+20\d{2}|20\d{2}\s*[-–]\s*(?:Present|20\d{2}|Now|\d+)/i;
    const hasDate = datePattern.test(bullet);
    
    // Role/company line pattern
    const roleMatch = bullet.match(/^(.+?)(?:[-|@,at]+|\s+at\s+)(.+?)(?:\s*[-|]\s*(.+))?$/);
    if (roleMatch || hasDate) {
      const entry = {
        _new: true,
        company: '',
        position: '',
        startDate: '',
        endDate: '',
        current: false,
        url: '',
        summary: '',
        highlights: []
      };
      
      if (roleMatch) {
        entry.position = (roleMatch[1] || '').trim();
        entry.company = (roleMatch[2] || '').trim();
      }
      
      // Extract dates
      const startMatch = bullet.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]*(20\d{2}|19\d{2})/i);
      const endMatch = bullet.match(/(?:[-–to]+\s*)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]*(20\d{2}|19\d{2}|Present|Now)/i);
      if (startMatch) entry.startDate = startMatch[0].replace(/[^0-9\-]/g, '');
      if (endMatch && !/(Present|Now)/i.test(endMatch[0])) entry.endDate = endMatch[0].replace(/[^0-9\-]/g, '');
      if (/Present|Now/i.test(bullet)) entry.current = true;
      
      return entry;
    }
    
    return null; // Bullet point, not a header
  }
  
  function parseEducationLine(line, allLines, idx) {
    const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
    if (!bullet) return null;
    
    const datePattern = /(?:19|20)\d{2}/;
    if (!datePattern.test(bullet)) return null;
    
    const entry = {
      _new: true,
      institution: '',
      url: '',
      area: '',
      studyType: '',
      startDate: '',
      endDate: '',
      score: '',
      courses: []
    };
    
    // Extract year
    const yearMatch = bullet.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) {
      entry.endDate = yearMatch[0];
      // Check for range
      const rangeMatch = bullet.match(/(20\d{2})\s*[-–to]+\s*(20\d{2}|Present)/);
      if (rangeMatch) {
        entry.startDate = rangeMatch[1];
        if (!/(Present)/i.test(rangeMatch[0])) entry.endDate = rangeMatch[2];
      }
    }
    
    // Extract degree
    const degreeMatch = bullet.match(/\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?|MBA|B\.Tech|M\.Tech|MCA|BCA)\b[^,\n]*/i);
    if (degreeMatch) entry.studyType = degreeMatch[0].replace(/[,|].*$/, '').trim();
    
    // Institution (usually in parentheses or after comma)
    const instMatch = bullet.match(/\(([^)]+)\)|,\s*([^,\n]+(?:University|Institute|College|School)/i);
    if (instMatch) {
      entry.institution = (instMatch[1] || instMatch[2] || '').trim();
    }
    
    // Area of study
    const areaMatch = bullet.match(/in\s+([^,\n]+(?:Engineering|Science|Arts|Commerce|Technology|Business|Computer|Information)/i);
    if (areaMatch) entry.area = areaMatch[1].trim();
    
    return entry;
  }
  
  function parseSkillLine(line) {
    const cleaned = line.replace(/^[•\-\*\|]\s*/, '').trim();
    if (!cleaned) return null;
    
    // Skill category header (e.g., "Programming Languages:", "Frameworks:")
    const isCategory = cleaned.endsWith(':') && !cleaned.includes(',');
    if (isCategory) {
      return {
        name: cleaned.replace(/:\s*$/, ''),
        level: '',
        keywords: []
      };
    }
    
    return null; // Comma-separated inline skills handled elsewhere
  }

  // ============================================================================
  // SECTION 3: LinkedIn Profile DOM Parser
  // ============================================================================

  function parseLinkedInProfile() {
    const profile = JSON.parse(JSON.stringify(RESUME_SCHEMA));
    
    try {
      // Name
      const nameEl = document.querySelector('.pv-top-card .fs-top-card-primary-block .text-heading-xlarge, .pv-top-card .pv-top-card-v2-section-info__name');
      if (nameEl) profile.basics.name = nameEl.textContent.trim();
      
      // Headline/title
      const headlineEl = document.querySelector('.pv-top-card .fs-top-card-primary-block .text-body-medium, .pv-top-card .pv-top-card-v2-section-info__headline');
      if (headlineEl) profile.basics.label = headlineEl.textContent.trim();
      
      // Email (only if on "Contact" tab)
      const emailEl = document.querySelector('.pv-contact-info__contact-type ci-email a, section.pv-profile-section__contact-info a[href^="mailto:"]');
      if (emailEl) profile.basics.email = emailEl.href.replace('mailto:', '');
      
      // Phone (only on Contact tab)
      const phoneEl = document.querySelector('.pv-contact-info__contact-type--phone span[aria-hidden="true"]');
      if (phoneEl) profile.basics.phone = phoneEl.textContent.trim();
      
      // Location
      const locationEl = document.querySelector('.pv-top-card .fs-top-card-primary-block .text-body-small, .pv-top-card__location .pv-top-card-v2-section-info__country');
      if (locationEl) {
        const locText = locationEl.textContent.trim();
        if (locText.includes(',')) {
          const parts = locText.split(',');
          profile.basics.location.city = parts[0].trim();
          profile.basics.location.region = parts.slice(1).join(',').trim();
        } else {
          profile.basics.location.city = locText;
        }
      }
      
      // LinkedIn URL
      const linkedinUrl = window.location.href;
      profile.basics.profiles.push({ network: 'LinkedIn', url: linkedinUrl, username: linkedinUrl.split('/in/')[1]?.split('?')[0] || '' });
      
      // Summary
      const summaryEl = document.querySelector('.pv-about-section .pv-about-section__summary-target, #summary-section .pv-about-section__summary-target');
      if (summaryEl) profile.basics.summary = summaryEl.textContent.trim();
      
      // Experience
      document.querySelectorAll('#experience-section ul li, .pv-profile-section__entities li').forEach(el => {
        const companyEl = el.querySelector('.pv-entity__company-summary-info .pv-entity__company-name, h3');
        const roleEl = el.querySelector('.pv-entity__summary-info h3, .pv-entity__role');
        const dateRange = el.querySelector('.pv-entity__date-range span[aria-hidden="true"], .pv-entity__bullet-item');
        
        if (companyEl) {
          const entry = {
            company: companyEl.textContent.trim(),
            position: (roleEl ? roleEl.textContent.trim() : ''),
            startDate: '',
            endDate: '',
            current: false,
            url: '',
            summary: '',
            highlights: []
          };
          
          if (dateRange) {
            const dates = dateRange.textContent.match(/\w+\s+\d{4}\s*[-–to]+\s*(?:\w+\s+\d{4}|Present)/g) || [];
            entry.startDate = dates[0] || '';
            if (/Present/.test(dates.join(''))) entry.current = true;
            entry.endDate = dates[1] || '';
          }
          
          // Highlights
          el.querySelectorAll('.pv-entity__bullet-item').forEach(bullet => {
            const text = bullet.textContent.trim();
            if (text) entry.highlights.push(text);
          });
          
          profile.work.push(entry);
        }
      });
      
      // Education
      document.querySelectorAll('#education-section .pv-profile-section__entities li, .education-section li').forEach(el => {
        const schoolEl = el.querySelector('.pv-entity__university-name, h3');
        const degreeEl = el.querySelector('.pv-entity__degree-name, .pv-entity__fos');
        const fieldEl = el.querySelector('.pv-entity__fos .pv-entity__bullet-item');
        const dateRange = el.querySelector('.pv-entity__dates span[aria-hidden="true"]');
        
        if (schoolEl) {
          const entry = {
            institution: schoolEl.textContent.trim(),
            url: '',
            area: (degreeEl ? degreeEl.textContent.trim() : ''),
            studyType: '',
            startDate: '',
            endDate: '',
            score: '',
            courses: []
          };
          
          if (fieldEl) entry.studyType = fieldEl.textContent.trim();
          if (dateRange) {
            const dates = dateRange.textContent.match(/\d{4}/g) || [];
            entry.startDate = dates[0] || '';
            entry.endDate = dates[1] || '';
          }
          
          profile.education.push(entry);
        }
      });
      
      // Skills
      document.querySelectorAll('.pv-skill-entity .pv-skill-entity__skill-name, .skills-section li').forEach(el => {
        const skillName = el.textContent.trim();
        if (skillName && skillName.length > 1 && skillName.length < 50) {
          profile.skills.push({ name: skillName, level: '', keywords: [] });
        }
      });
      
    } catch (err) {
      console.warn('[FillY] LinkedIn parser error:', err.message);
    }
    
    return profile;
  }

  // ============================================================================
  // SECTION 4: LinkedIn URL → Profile Converter (via ScrapedIn-style approach)
  // ============================================================================

  /**
   * Scrape LinkedIn profile by navigating to it and extracting data.
   * Requires user to be logged in to LinkedIn.
   */
  async function scrapeLinkedInProfile(linkedinUrl) {
    return new Promise(async (resolve, reject) => {
      try {
        // Navigate to LinkedIn profile
        const response = await fetch(linkedinUrl, {
          credentials: 'include', // Include cookies for auth
          headers: { 'Accept': 'text/html' }
        });
        
        if (!response.ok) {
          reject(new Error(`LinkedIn fetch failed: ${response.status}`));
          return;
        }
        
        const html = await response.text();
        
        // Extract JSON-LD data (LinkedIn often embeds profile as JSON-LD)
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (jsonLdMatch) {
          try {
            const ldJson = JSON.parse(jsonLdMatch[1]);
            resolve(ldJsonToResume(ldJson));
            return;
          } catch (e) {
            console.warn('[FillY] JSON-LD parse failed, falling back to DOM');
          }
        }
        
        // Fallback: inject and parse DOM (requires being on the page)
        const profile = parseLinkedInProfile();
        if (profile.basics.name) {
          resolve(profile);
        } else {
          reject(new Error('Could not parse LinkedIn profile. Make sure you are logged in.'));
        }
        
      } catch (err) {
        reject(err);
      }
    });
  }
  
  function ldJsonToResume(ldJson) {
    const profile = JSON.parse(JSON.stringify(RESUME_SCHEMA));
    
    if (ldJson.name) profile.basics.name = ldJson.name;
    if (ldJson.jobTitle) profile.basics.label = ldJson.jobTitle;
    if (ldJson.email) profile.basics.email = ldJson.email;
    if (ldJson.telephone) profile.basics.phone = ldJson.telephone;
    if (ldJson.address) {
      if (ldJson.address.addressLocality) profile.basics.location.city = ldJson.address.addressLocality;
      if (ldJson.address.addressRegion) profile.basics.location.region = ldJson.address.addressRegion;
      if (ldJson.address.addressCountry) profile.basics.location.countryCode = ldJson.address.addressCountry;
    }
    if (ldJson.description) profile.basics.summary = ldJson.description;
    
    // Work experience
    if (ldJson.experience) {
      ldJson.experience.forEach(exp => {
        profile.work.push({
          company: exp.organization?.name || '',
          position: exp.jobTitle || '',
          startDate: exp.startDate ? `${exp.startDate}` : '',
          endDate: exp.endDate ? `${exp.endDate}` : '',
          current: !exp.endDate,
          url: exp.url || '',
          summary: exp.description || '',
          highlights: []
        });
      });
    }
    
    // Education
    if (ldJson.alumniOf) {
      const alumni = Array.isArray(ldJson.alumniOf) ? ldJson.alumniOf : [ldJson.alumniOf];
      alumni.forEach(edu => {
        profile.education.push({
          institution: edu.name || '',
          url: edu.url || '',
          area: edu.fieldOfStudy || '',
          studyType: edu.educationalCredentialAwarded || '',
          startDate: '',
          endDate: edu.endDate || '',
          score: '',
          courses: []
        });
      });
    }
    
    // Skills
    if (ldJson.knowsAbout) {
      const skills = Array.isArray(ldJson.knowsAbout) ? ldJson.knowsAbout : [ldJson.knowsAbout];
      skills.forEach(skill => {
        if (typeof skill === 'string') {
          profile.skills.push({ name: skill, level: '', keywords: [] });
        }
      });
    }
    
    return profile;
  }

  // ============================================================================
  // SECTION 5: FillY Profile → Form Fill Profile Converter
  // ============================================================================

  /**
   * Convert JSON Resume format to FillY fill-profile (flat key-value map for form filling).
   * Maps nested resume fields to flat form-fillable fields.
   */
  function resumeToFillProfile(resume) {
    const fp = {};
    const b = resume.basics || {};
    
    // Name
    if (b.name) {
      const parts = b.name.trim().split(/\s+/);
      fp.first_name = parts[0] || '';
      fp.last_name = parts.slice(1).join(' ') || '';
      fp.full_name = b.name.trim();
    }
    
    if (b.email) fp.email = b.email;
    if (b.phone) fp.phone = b.phone;
    if (b.url) fp.website = b.url;
    
    // Location
    if (b.location) {
      if (b.location.city) fp.city = b.location.city;
      if (b.location.region) fp.state = b.location.region;
      if (b.location.countryCode) fp.country = countryCodeToName(b.location.countryCode);
    }
    
    // Profiles
    (b.profiles || []).forEach(p => {
      if (p.network?.toLowerCase().includes('linkedin')) fp.linkedin = p.url || p.username;
      if (p.network?.toLowerCase().includes('github')) fp.github = p.url || p.username;
      if (p.network?.toLowerCase().includes('twitter')) fp.twitter = p.url || p.username;
    });
    
    // Work experience → current_company, current_title
    if (resume.work?.length > 0) {
      const latest = resume.work[0];
      fp.current_company = latest.company || '';
      fp.current_title = latest.position || '';
      
      // First job entry details
      if (latest.startDate) fp.start_date_year = extractYear(latest.startDate);
      if (latest.endDate && !latest.current) fp.end_date_year = extractYear(latest.endDate);
      
      // Build experience string
      const totalYears = calculateExperienceYears(resume.work);
      if (totalYears) fp.years_of_experience = String(totalYears);
    }
    
    // All work entries for work history
    fp.work_history = resume.work.map(w => ({
      company: w.company,
      title: w.position,
      start: w.startDate,
      end: w.current ? 'Present' : (w.endDate || ''),
      highlights: w.highlights || []
    }));
    
    // Education
    if (resume.education?.length > 0) {
      const latest = resume.education[0];
      fp.school = latest.institution || '';
      fp.degree = latest.studyType || '';
      fp.field_of_study = latest.area || '';
      if (latest.endDate) fp.graduation_year = extractYear(latest.endDate);
    }
    
    // All education
    fp.education_history = resume.education.map(e => ({
      institution: e.institution,
      degree: e.studyType,
      area: e.area,
      endYear: e.endDate ? extractYear(e.endDate) : ''
    }));
    
    // Skills
    const allSkills = [];
    (resume.skills || []).forEach(skillGroup => {
      if (skillGroup.name) allSkills.push(skillGroup.name);
      if (skillGroup.keywords) allSkills.push(...skillGroup.keywords);
    });
    fp.skills = allSkills.join(', ');
    fp.skill_list = allSkills;
    
    // Languages
    fp.languages = (resume.languages || []).map(l => l.language).filter(Boolean);
    
    // Certifications
    fp.certifications = (resume.certificates || []).map(c => c.name).filter(Boolean);
    
    // Summary
    fp.summary = b.summary || '';
    
    return fp;
  }
  
  function extractYear(dateStr) {
    if (!dateStr) return '';
    const match = String(dateStr).match(/\d{4}/);
    return match ? match[0] : '';
  }
  
  function calculateExperienceYears(workEntries) {
    if (!workEntries || workEntries.length === 0) return null;
    const currentYear = new Date().getFullYear();
    let earliest = currentYear;
    let latestPresent = false;
    
    workEntries.forEach(entry => {
      const startYear = parseInt(extractYear(entry.startDate));
      const endYear = entry.current ? currentYear : parseInt(extractYear(entry.endDate));
      if (startYear && startYear < earliest) earliest = startYear;
      if (entry.current) latestPresent = true;
      if (endYear && endYear < currentYear) {
        if (latestPresent) earliest = Math.min(earliest, startYear || currentYear);
      }
    });
    
    if (earliest === currentYear) return null;
    return latestPresent ? (currentYear - earliest) : (currentYear - earliest);
  }
  
  function countryCodeToName(code) {
    const codes = {
      'US': 'United States', 'IN': 'India', 'GB': 'United Kingdom',
      'CA': 'Canada', 'AU': 'Australia', 'DE': 'Germany', 'FR': 'France',
      'SG': 'Singapore', 'JP': 'Japan', 'AE': 'United Arab Emirates',
      'NL': 'Netherlands', 'CH': 'Switzerland', 'IE': 'Ireland',
      'NZ': 'New Zealand', 'ZA': 'South Africa', 'BR': 'Brazil'
    };
    return codes[code?.toUpperCase()] || code || '';
  }

  // ============================================================================
  // SECTION 6: Public API
  // ============================================================================

  window.FillYResume = {
    parse: parseTextResume,
    parseLinkedIn: parseLinkedInProfile,
    scrapeLinkedIn: scrapeLinkedInProfile,
    resumeToFillProfile,
    SCHEMA: RESUME_SCHEMA,
  };

  console.log('[FillY] Resume parser loaded. API: window.FillYResume.parse(text), .parseLinkedIn(), .scrapeLinkedIn(url), .resumeToFillProfile(resume)');
})();
