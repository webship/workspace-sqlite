Feature: The SQLite plugin
  Once the plugin is activated and installed, a project row that keeps its data in a SQLite file carries the DATABASE
  menu, the plugin has its page in Settings with its setting and its tool, and its AI items are in the folders of
  their kind. (The menu itself needs a project with a SQLite file, which the browser suite's workspace has not: the
  unit tests draw it, and the README says on which real projects it was run.)

  # Settings lists every plugin the workspace has, by family; the package is on the plugin's own page.
  Scenario: Settings lists the plugin, and its own page names its package, its setting and its tool
    Given I am on "/settings"
     Then I should see "SQLite"
     When I go to "/settings/plugin/sqlite"
     Then I should see "@webship.co/workspace-sqlite"
      And I should see "Copies kept per project"
      And I should see "cmd-tools-sqlite.sh"

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents?q=sqlite-helper"
     Then I should see "sqlite-helper"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=sqlite-database"
     Then I should see "sqlite-database"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=sqlite-sizes"
     Then I should see "sqlite-sizes"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts?q=sqlite-copy-and-check"
     Then I should see "sqlite-copy-and-check"
