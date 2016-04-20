---
layout: default
---

# Releases
{% for release in site.data.gendoclist.releases %}
[View the docs for {{ release }}]({{ release | prepend: "/docs/releases/" | prepend: site.github.url | replace: 'http://', 'https://' }})
{% endfor %}

# Github Branches
{% for doc in site.data.gendoclist.docs %}
[View the docs for {{doc | capitalize}}]({{ doc | prepend: "/docs/" | prepend: site.github.url | replace: 'http://', 'https://' }})
{% endfor %}
