# sql-test — local, sem rede

```text
CREATE ROLE
CREATE ROLE
CREATE ROLE
CREATE SCHEMA
CREATE TYPE
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE VIEW
              set_config              | set_config |              set_config              |        set_config        
--------------------------------------+------------+--------------------------------------+--------------------------
 11111111-1111-1111-1111-111111111111 | true       | 7d831e59-6e82-427b-95a0-64904aae5dd2 | {"role":"authenticated"}
(1 row)

INSERT 0 3
INSERT 0 8
INSERT 0 3
INSERT 0 2
INSERT 0 1
CREATE TABLE
CREATE FUNCTION
REVOKE
GRANT
              set_config              | set_config |              set_config              |        set_config        
--------------------------------------+------------+--------------------------------------+--------------------------
 11111111-1111-1111-1111-111111111111 | true       | 7d831e59-6e82-427b-95a0-64904aae5dd2 | {"role":"authenticated"}
(1 row)

DO
CREATE FUNCTION
REVOKE
GRANT
CREATE FUNCTION
REVOKE
GRANT
              set_config              | set_config |              set_config              |        set_config        
--------------------------------------+------------+--------------------------------------+--------------------------
 11111111-1111-1111-1111-111111111111 | true       | 7d831e59-6e82-427b-95a0-64904aae5dd2 | {"role":"authenticated"}
(1 row)

psql:/dev-server/scripts/coala-meta-audience/assertions.sql:21: NOTICE:  9 legacy filters + eligibility/withdrawal/service/auth/tenant/ACL passed
DO
BEGIN
ALTER TABLE
ALTER TABLE
INSERT 0 1
INSERT 0 1
       set_config        
-------------------------
 {"role":"service_role"}
(1 row)

INSERT 0 10
INSERT 0 3
psql:/dev-server/scripts/newgang-meta-audience/assertions.sql:33: NOTICE:  Newgang v2 eligibility, v1/false/withdrawal/suppression/company/event, phone, admin and tenant passed
DO
ROLLBACK

```
